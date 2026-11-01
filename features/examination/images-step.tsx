"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Maximize2, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Alert } from "@/components/feedback/states";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { ImageViewer } from "@/components/modals/image-viewer";
import { IconButton } from "@/components/ui/button";
import { EvidenceImage } from "@/components/ui/evidence-image";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { ACCEPTED_IMAGE_EXTENSIONS, MAX_IMAGE_BYTES } from "@/lib/image";
import { useExaminationsStore } from "@/stores/examinations";
import { toast } from "@/stores/toast";
import type { Examination, ExaminationImage, ExaminationImageRole } from "@/types/examination";

import { isImageMarked, MAX_EXAMINATION_IMAGES } from "./model";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function AddTile({
  title,
  hint,
  questioned = false,
  busy,
  onFiles,
}: {
  title: string;
  hint: string;
  questioned?: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) onFiles([...event.dataTransfer.files]);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className={cn("flex h-7 items-center text-[13px] font-semibold", questioned ? "text-brand-strong" : "text-ink-2")}>
        {questioned ? "Questioned" : "Standards"}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "pressable flex aspect-4/3 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-3 text-center disabled:cursor-wait",
          dragging
            ? "border-brand bg-brand-soft"
            : questioned
              ? "border-brand-line bg-brand-soft/50 hover:border-brand"
              : "border-line-strong bg-canvas hover:border-ink-4",
        )}
      >
        {busy ? <Spinner className="size-5" /> : <ImagePlus className={cn("size-5", questioned ? "text-brand" : "text-ink-3")} aria-hidden />}
        <span className="text-[13.5px] font-semibold text-ink">{busy ? "Adding…" : title}</span>
        <span className="text-[12.5px] text-ink-3">{hint}</span>
      </button>
    </div>
  );
}

function SignatureTile({
  image,
  url,
  canMoveEarlier,
  canMoveLater,
  onView,
  onRemove,
}: {
  image: ExaminationImage;
  url: string | undefined;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onView: () => void;
  onRemove: () => void;
}) {
  const store = useExaminationsStore.getState();
  const questioned = image.role === "questioned";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between gap-2">
        <p className={cn("text-[13px] font-semibold whitespace-nowrap tabular", questioned ? "text-brand-strong" : "text-ink")}>
          {image.label}
          {questioned ? <span className="font-medium"> Questioned</span> : <span className="sr-only"> Standard</span>}
        </p>
        {questioned ? null : (
          <button
            type="button"
            onClick={() => store.setQuestioned(image.id)}
            className="pressable rounded-sm px-1.5 py-1 text-[12.5px] font-semibold whitespace-nowrap text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label={`Set ${image.label} as the questioned signature`}
          >
            Set as questioned
          </button>
        )}
      </div>
      <EvidenceImage
        src={url ?? null}
        alt={`${image.label}, ${questioned ? "questioned" : "standard"} signature`}
        className={cn("aspect-4/3 rounded-md border", questioned ? "border-2 border-brand" : "border-line-strong")}
        title={image.sourceName}
      />
      <div className="flex items-center gap-0.5">
        {questioned ? null : (
          <>
            <IconButton size="sm" label={`Move ${image.label} earlier`} disabled={!canMoveEarlier} onClick={() => store.moveStandard(image.id, -1)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton size="sm" label={`Move ${image.label} later`} disabled={!canMoveLater} onClick={() => store.moveStandard(image.id, 1)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </>
        )}
        <span className="flex-1" />
        <IconButton size="sm" label={`View ${image.label} larger`} disabled={!url} onClick={onView}>
          <Maximize2 className="size-4" />
        </IconButton>
        <IconButton size="sm" label={`Remove ${image.label}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function ImagesPanel({ examination }: { examination: Examination }) {
  const imageUrls = useExaminationsStore((state) => state.imageUrls);
  const [adding, setAdding] = useState<ExaminationImageRole | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [viewing, setViewing] = useState<ExaminationImage | null>(null);
  const [pendingRemove, setPendingRemove] = useState<ExaminationImage | null>(null);
  const [removing, setRemoving] = useState(false);

  const standards = examination.images.filter((image) => image.role === "standard");
  const questioned = examination.images.find((image) => image.role === "questioned");
  const isFull = examination.images.length >= MAX_EXAMINATION_IMAGES;

  const addFiles = async (files: File[], role: ExaminationImageRole) => {
    setAdding(role);
    setFailures([]);
    // Only the first of several files can be the questioned signature.
    const images = files.map((file, index) => ({ file, role: index === 0 ? role : ("standard" as const) }));
    setFailures(await useExaminationsStore.getState().addImages(images));
    setAdding(null);
  };

  const remove = async (image: ExaminationImage) => {
    setRemoving(true);
    try {
      await useExaminationsStore.getState().removeImage(image.id);
      setPendingRemove(null);
    } catch {
      toast.error(`Could not remove ${image.label}. Try again.`);
    } finally {
      setRemoving(false);
    }
  };

  const requestRemove = (image: ExaminationImage) => {
    // Nothing is lost on an unmarked image; marked ones ask first.
    if (isImageMarked(examination, image.id)) setPendingRemove(image);
    else void remove(image);
  };

  const summary = [
    `${examination.images.length} of ${MAX_EXAMINATION_IMAGES} images`,
    questioned ? "1 questioned" : "no questioned signature yet",
    plural(standards.length, "standard"),
  ].join(", ");

  return (
    <Panel title="Signatures" description={<span className="tabular">{summary}</span>}>
      {failures.length ? (
        <Alert className="mb-4" title={failures.length === 1 ? "One file wasn't added" : `${failures.length} files weren't added`}>
          <ul>
            {failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-x-4 gap-y-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {questioned ? (
          <SignatureTile
            image={questioned}
            url={imageUrls[questioned.id]}
            canMoveEarlier={false}
            canMoveLater={false}
            onView={() => setViewing(questioned)}
            onRemove={() => requestRemove(questioned)}
          />
        ) : (
          <AddTile
            questioned
            title="Add the questioned signature"
            hint="Drop an image or browse"
            busy={adding === "questioned"}
            onFiles={(files) => void addFiles(files, "questioned")}
          />
        )}
        {standards.map((image, index) => (
          <SignatureTile
            key={image.id}
            image={image}
            url={imageUrls[image.id]}
            canMoveEarlier={index > 0}
            canMoveLater={index < standards.length - 1}
            onView={() => setViewing(image)}
            onRemove={() => requestRemove(image)}
          />
        ))}
        {isFull ? null : (
          <AddTile
            title="Add standards"
            hint={`PNG, JPEG or WebP, up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB each`}
            busy={adding === "standard"}
            onFiles={(files) => void addFiles(files, "standard")}
          />
        )}
      </div>

      <ImageViewer
        src={viewing ? (imageUrls[viewing.id] ?? null) : null}
        title={viewing ? `${viewing.label}: ${viewing.sourceName}` : ""}
        onClose={() => setViewing(null)}
      />
      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => (pendingRemove ? remove(pendingRemove) : undefined)}
        loading={removing}
        tone="danger"
        title={`Remove ${pendingRemove?.label ?? "this image"}?`}
        description="Its markers and chart crops will also be removed. This can't be undone."
        confirmLabel="Remove image"
      />
    </Panel>
  );
}
