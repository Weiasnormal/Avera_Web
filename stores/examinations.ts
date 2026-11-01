import { create } from "zustand";

import { arrangeImages, createExamination, MAX_EXAMINATION_IMAGES, newId, withoutImage } from "@/features/examination/model";
import { decodeImage, ImageValidationError, validateImageFile } from "@/lib/image";
import { ExaminationConflictError, examinationRepository } from "@/services/examinations";
import type { Examination, ExaminationImage, ExaminationImageRole, ExaminationPatch } from "@/types/examination";

import { useSessionStore } from "./session";

// The examinations list and the one being worked on. Edits apply to memory at
// once and are written after a short pause, one save at a time, so typing and
// dragging never wait on storage.

const AUTOSAVE_DELAY_MS = 600;

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type CurrentStatus = LoadStatus | "missing";
export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

export interface NewExaminationImage {
  file: File;
  role: ExaminationImageRole;
}

interface ExaminationsStore {
  items: Examination[];
  listStatus: LoadStatus;
  current: Examination | null;
  currentStatus: CurrentStatus;
  /** Object URLs for the current examination's images, by image id. */
  imageUrls: Record<string, string>;
  saveStatus: SaveStatus;
  saveError: string | null;
  loadList: () => Promise<void>;
  create: (seed?: ExaminationPatch) => Promise<Examination>;
  open: (id: string) => Promise<void>;
  update: (patch: ExaminationPatch) => void;
  /** Adds what it can and returns a message for each file it couldn't. */
  addImages: (images: NewExaminationImage[]) => Promise<string[]>;
  removeImage: (imageId: string) => Promise<void>;
  setQuestioned: (imageId: string) => void;
  moveStandard: (imageId: string, delta: -1 | 1) => void;
  flush: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

interface PendingSave {
  userId: string;
  examination: Examination;
}

function requireUserId() {
  const userId = useSessionStore.getState().claims?.userId;
  if (!userId) throw new Error("Sign in again to continue.");
  return userId;
}

function revokeUrls(urls: Record<string, string>) {
  Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
}

async function readImageUrls(userId: string, images: ExaminationImage[]) {
  const entries = await Promise.all(
    images.map(async (image) => {
      const blob = await examinationRepository.getImage(userId, image.id);
      return blob ? ([image.id, URL.createObjectURL(blob)] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export const useExaminationsStore = create<ExaminationsStore>((set, get) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let unsaved: PendingSave | null = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function persist(): Promise<void> {
    clearTimer();
    queue = queue.then(async () => {
      const pending = unsaved;
      if (!pending) return;
      unsaved = null;
      const isCurrent = () => get().current?.id === pending.examination.id;
      if (isCurrent()) set({ saveStatus: "saving", saveError: null });
      try {
        const saved = await examinationRepository.save(pending.userId, pending.examination);
        // Edits made during this save are queued against the old version: move them forward.
        const newer = unsaved as PendingSave | null;
        if (newer?.examination.id === saved.id) {
          unsaved = { ...newer, examination: { ...newer.examination, version: saved.version } };
        }
        if (!isCurrent()) return;
        set((state) => ({
          current: state.current && { ...state.current, version: saved.version, updatedAt: saved.updatedAt },
          saveStatus: unsaved ? "pending" : "saved",
          saveError: null,
        }));
      } catch (error) {
        if (error instanceof ExaminationConflictError) {
          // Saving again would overwrite the other tab, so wait for a reload.
          if (isCurrent()) set({ saveStatus: "conflict", saveError: error.message });
          return;
        }
        // Keep the newest edits for the next attempt.
        unsaved ??= pending;
        if (isCurrent()) set({ saveStatus: "error", saveError: error instanceof Error ? error.message : "Could not save." });
      }
    });
    return queue;
  }

  return {
    items: [],
    listStatus: "idle",
    current: null,
    currentStatus: "idle",
    imageUrls: {},
    saveStatus: "saved",
    saveError: null,

    loadList: async () => {
      await get().flush();
      set({ listStatus: get().items.length ? "ready" : "loading" });
      try {
        const all = await examinationRepository.list(requireUserId());
        // Coming back to the list ends any practice run.
        const practice = all.filter((item) => item.isPractice);
        await Promise.all(practice.map((item) => get().remove(item.id)));
        set({ items: all.filter((item) => !item.isPractice), listStatus: "ready" });
      } catch {
        set({ listStatus: "error" });
      }
    },

    create: async (seed) => {
      await get().flush();
      revokeUrls(get().imageUrls);
      const saved = await examinationRepository.save(requireUserId(), { ...createExamination(), ...seed });
      set((state) => ({
        items: [saved, ...state.items],
        current: saved,
        currentStatus: "ready",
        imageUrls: {},
        saveStatus: "saved",
        saveError: null,
      }));
      return saved;
    },

    open: async (id) => {
      if (get().current?.id === id && get().currentStatus === "ready") return;
      await get().flush();
      revokeUrls(get().imageUrls);
      set({ current: null, currentStatus: "loading", imageUrls: {}, saveStatus: "saved", saveError: null });
      try {
        const userId = requireUserId();
        const examination = await examinationRepository.get(userId, id);
        const imageUrls = examination ? await readImageUrls(userId, examination.images) : {};
        set({ current: examination, currentStatus: examination ? "ready" : "missing", imageUrls });
      } catch {
        set({ currentStatus: "error" });
      }
    },

    update: (patch) => {
      const current = get().current;
      if (!current || get().saveStatus === "conflict") return;
      const examination = { ...current, ...patch };
      set({ current: examination, saveStatus: "pending" });
      unsaved = { userId: requireUserId(), examination };
      clearTimer();
      timer = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    },

    addImages: async (images) => {
      const failures: string[] = [];
      const userId = requireUserId();
      for (const { file, role } of images) {
        const current = get().current;
        if (!current || get().saveStatus === "conflict") break;
        try {
          validateImageFile(file);
          if (current.images.length >= MAX_EXAMINATION_IMAGES) {
            throw new ImageValidationError(`an examination holds up to ${MAX_EXAMINATION_IMAGES} images.`);
          }
          const bitmap = await decodeImage(file);
          const { width, height } = bitmap;
          bitmap.close();
          const id = newId();
          await examinationRepository.putImage(userId, current.id, id, file);
          const image: ExaminationImage = {
            id,
            role: role === "questioned" && !current.images.some((item) => item.role === "questioned") ? "questioned" : "standard",
            label: "",
            order: 0,
            sourceName: file.name,
            width,
            height,
            crop: null,
          };
          set((state) => ({ imageUrls: { ...state.imageUrls, [id]: URL.createObjectURL(file) } }));
          // Read again: the examiner can keep editing while files are processed.
          const latest = get().current ?? current;
          get().update({ images: arrangeImages([...latest.images, image]) });
        } catch (error) {
          const reason = error instanceof ImageValidationError || error instanceof Error ? error.message : "It could not be added.";
          failures.push(`${file.name}: ${reason}`);
        }
      }
      return failures;
    },

    removeImage: async (imageId) => {
      const current = get().current;
      if (!current) return;
      get().update(withoutImage(current, imageId));
      await get().flush();
      await examinationRepository.removeImage(requireUserId(), imageId);
      set((state) => {
        const imageUrls = { ...state.imageUrls };
        if (imageUrls[imageId]) URL.revokeObjectURL(imageUrls[imageId]);
        delete imageUrls[imageId];
        return { imageUrls };
      });
    },

    // One questioned signature per examination: the previous one becomes a standard.
    setQuestioned: (imageId) => {
      const current = get().current;
      if (!current) return;
      get().update({
        images: arrangeImages(
          current.images.map((image) => ({ ...image, role: image.id === imageId ? ("questioned" as const) : ("standard" as const) })),
        ),
      });
    },

    moveStandard: (imageId, delta) => {
      const current = get().current;
      if (!current) return;
      const images = [...current.images];
      const from = images.findIndex((image) => image.id === imageId);
      const to = from + delta;
      if (from < 0 || images[from].role !== "standard" || images[to]?.role !== "standard") return;
      [images[from], images[to]] = [images[to], images[from]];
      get().update({ images: arrangeImages(images) });
    },

    flush: () => persist(),

    remove: async (id) => {
      const userId = requireUserId();
      if (unsaved?.examination.id === id) unsaved = null;
      await queue;
      await examinationRepository.remove(userId, id);
      set((state) => {
        const isCurrent = state.current?.id === id;
        if (isCurrent) revokeUrls(state.imageUrls);
        return {
          items: state.items.filter((item) => item.id !== id),
          ...(isCurrent ? { current: null, currentStatus: "idle" as const, imageUrls: {} } : null),
        };
      });
    },

    // Runs on sign-out, before the session is cleared. Saved work stays on this
    // device for the same user; only the in-memory copy is dropped.
    reset: () => {
      void persist();
      revokeUrls(get().imageUrls);
      set({ items: [], listStatus: "idle", current: null, currentStatus: "idle", imageUrls: {}, saveStatus: "saved", saveError: null });
    },
  };
});
