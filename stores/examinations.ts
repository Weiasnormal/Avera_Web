import { create } from "zustand";

import { createExamination } from "@/features/examination/model";
import { ExaminationConflictError, examinationRepository } from "@/services/examinations";
import type { Examination, ExaminationPatch } from "@/types/examination";

import { useSessionStore } from "./session";

// The examinations list and the one being worked on. Edits apply to memory at
// once and are written after a short pause, one save at a time, so typing and
// dragging never wait on storage.

const AUTOSAVE_DELAY_MS = 600;

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type CurrentStatus = LoadStatus | "missing";
export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

interface ExaminationsStore {
  items: Examination[];
  listStatus: LoadStatus;
  current: Examination | null;
  currentStatus: CurrentStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  loadList: () => Promise<void>;
  create: () => Promise<Examination>;
  open: (id: string) => Promise<void>;
  update: (patch: ExaminationPatch) => void;
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
    saveStatus: "saved",
    saveError: null,

    loadList: async () => {
      await get().flush();
      set({ listStatus: get().items.length ? "ready" : "loading" });
      try {
        set({ items: await examinationRepository.list(requireUserId()), listStatus: "ready" });
      } catch {
        set({ listStatus: "error" });
      }
    },

    create: async () => {
      await get().flush();
      const saved = await examinationRepository.save(requireUserId(), createExamination());
      set((state) => ({
        items: [saved, ...state.items],
        current: saved,
        currentStatus: "ready",
        saveStatus: "saved",
        saveError: null,
      }));
      return saved;
    },

    open: async (id) => {
      if (get().current?.id === id && get().currentStatus === "ready") return;
      await get().flush();
      set({ current: null, currentStatus: "loading", saveStatus: "saved", saveError: null });
      try {
        const examination = await examinationRepository.get(requireUserId(), id);
        set({ current: examination, currentStatus: examination ? "ready" : "missing" });
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

    flush: () => persist(),

    remove: async (id) => {
      const userId = requireUserId();
      if (unsaved?.examination.id === id) unsaved = null;
      await queue;
      await examinationRepository.remove(userId, id);
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        ...(state.current?.id === id ? { current: null, currentStatus: "idle" as const } : null),
      }));
    },

    // Runs on sign-out, before the session is cleared. Saved work stays on this
    // device for the same user; only the in-memory copy is dropped.
    reset: () => {
      void persist();
      set({ items: [], listStatus: "idle", current: null, currentStatus: "idle", saveStatus: "saved", saveError: null });
    },
  };
});
