"use client";

import { Check, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Button, IconButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { useExaminationsStore } from "@/stores/examinations";
import type { Examination, ExaminationImage, NormalizedRect } from "@/types/examination";

import { SignatureStrip } from "./signature-strip";
import { ZoomViewport } from "./zoom-viewport";

// Crops are stored as a frame on the original, so every crop can be changed later.

const FULL: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
const MIN_SIZE = 0.02;
const KEY_STEP = 0.01;

type DragMode = "draw" | "move" | "nw" | "ne" | "sw" | "se";

const HANDLES: { mode: DragMode; position: string; cursor: string }[] = [
  { mode: "nw", position: "-top-3 -left-3", cursor: "nwse-resize" },
  { mode: "ne", position: "-top-3 -right-3", cursor: "nesw-resize" },
  { mode: "sw", position: "-bottom-3 -left-3", cursor: "nesw-resize" },
  { mode: "se", position: "-bottom-3 -right-3", cursor: "nwse-resize" },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function isFullFrame(rect: NormalizedRect) {
  return rect.x <= 0 && rect.y <= 0 && rect.width >= 1 && rect.height >= 1;
}

function CropStage({
  image,
  url,
  onCommit,
}: {
  image: ExaminationImage;
  url: string | undefined;
  onCommit: (rect: NormalizedRect) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: NormalizedRect } | null>(null);
  const [rect, setRect] = useState<NormalizedRect>(image.crop ?? FULL);
  const isFull = isFullFrame(rect);

  const point = (event: PointerEvent) => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  };

  const onPointerDown = (event: PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an enhancement; dragging still works without it.
    }
    const { x, y } = point(event);
    const mode = ((event.target as HTMLElement).dataset.mode as DragMode | undefined) ?? "draw";
    drag.current = { mode, startX: x, startY: y, start: rect };
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const { x, y } = point(event);
    const { start } = state;
    if (state.mode === "draw") {
      setRect({ x: Math.min(state.startX, x), y: Math.min(state.startY, y), width: Math.abs(x - state.startX), height: Math.abs(y - state.startY) });
    } else if (state.mode === "move") {
      setRect({
        ...start,
        x: clamp(start.x + x - state.startX, 0, 1 - start.width),
        y: clamp(start.y + y - state.startY, 0, 1 - start.height),
      });
    } else {
      const left = state.mode === "nw" || state.mode === "sw" ? x : start.x;
      const right = state.mode === "ne" || state.mode === "se" ? x : start.x + start.width;
      const top = state.mode === "nw" || state.mode === "ne" ? y : start.y;
      const bottom = state.mode === "sw" || state.mode === "se" ? y : start.y + start.height;
      setRect({ x: Math.min(left, right), y: Math.min(top, bottom), width: Math.abs(right - left), height: Math.abs(bottom - top) });
    }
  };

  const onPointerUp = () => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    // A click or tiny drag leaves the existing frame alone.
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      setRect(state.start);
      return;
    }
    onCommit(rect);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta;
    const next = event.shiftKey
      ? {
          ...rect,
          width: clamp(rect.width + dx, MIN_SIZE, 1 - rect.x),
          height: clamp(rect.height + dy, MIN_SIZE, 1 - rect.y),
        }
      : { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
    setRect(next);
    onCommit(next);
  };

  const pct = (value: number) => `${value * 100}%`;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 cursor-crosshair touch-none bg-white select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img src={url} alt={`${image.label} signature to crop`} draggable={false} className="pointer-events-none size-full" />
      ) : null}
      {isFull ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-ink/45"
          style={{
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(rect.x)} ${pct(rect.y)}, ${pct(rect.x)} ${pct(bottom)}, ${pct(right)} ${pct(bottom)}, ${pct(right)} ${pct(rect.y)}, ${pct(rect.x)} ${pct(rect.y)})`,
          }}
        />
      )}
      <div
        tabIndex={0}
        role="group"
        aria-label={`Crop frame for ${image.label}. Arrow keys move it. Shift and arrow keys resize it.`}
        data-mode={isFull ? "draw" : "move"}
        onKeyDown={onKeyDown}
        className={cn("absolute border-2 border-brand", isFull ? "cursor-crosshair" : "cursor-move")}
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.width), height: pct(rect.height) }}
      >
        {HANDLES.map((handle) => (
          <span
            key={handle.mode}
            data-mode={handle.mode}
            className={cn("absolute flex size-6 items-center justify-center", handle.position)}
            style={{ cursor: handle.cursor }}
          >
            <span className="pointer-events-none size-3 rounded-full border-2 border-brand bg-white" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function CropPanel({ examination }: { examination: Examination }) {
  const imageUrls = useExaminationsStore((state) => state.imageUrls);
  const [activeId, setActiveId] = useState(examination.images[0]?.id);
  const images = examination.images;
  const index = Math.max(0, images.findIndex((image) => image.id === activeId));
  const active = images[index];
  const croppedCount = images.filter((image) => image.crop).length;

  const setCrop = (imageId: string, crop: NormalizedRect | null) => {
    const store = useExaminationsStore.getState();
    const latest = store.current;
    if (!latest) return;
    store.update({
      images: latest.images.map((image) => (image.id === imageId ? { ...image, crop: crop && !isFullFrame(crop) ? crop : null } : image)),
    });
  };

  return (
    <Panel>
      <p className="mb-2.5 text-[13px] text-ink-3 tabular">
        {croppedCount} of {images.length} cropped
      </p>
      <SignatureStrip
        images={images}
        imageUrls={imageUrls}
        activeId={active.id}
        onSelect={setActiveId}
        badge={(image) => (image.crop ? <Check className="size-3.5 text-brand" aria-label="Cropped" /> : null)}
      />

      <ZoomViewport
        key={active.id}
        aspect={active.width / active.height}
        toolbar={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={!active.crop}
              icon={<RotateCcw className="size-3.5" aria-hidden />}
              onClick={() => setCrop(active.id, null)}
            >
              Use full image
            </Button>
            <IconButton size="sm" label="Previous signature" disabled={index === 0} onClick={() => setActiveId(images[index - 1].id)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="w-7 text-center text-[13px] font-semibold text-ink tabular">{active.label}</span>
            <IconButton size="sm" label="Next signature" disabled={index === images.length - 1} onClick={() => setActiveId(images[index + 1].id)}>
              <ChevronRight className="size-4" />
            </IconButton>
          </>
        }
      >
        {/* The crop value in the key resets the frame when "Use full image" is pressed. */}
        <CropStage key={active.crop ? "cropped" : "full"} image={active} url={imageUrls[active.id]} onCommit={(rect) => setCrop(active.id, rect)} />
      </ZoomViewport>
      <p className="mt-2.5 text-[13px] text-ink-3">Drag on the image to draw a frame, then drag the frame or its corners to adjust.</p>
    </Panel>
  );
}
