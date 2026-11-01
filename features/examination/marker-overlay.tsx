"use client";

import { useId, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/cn";
import type { ExaminationImage, ExaminationMarker, MarkerPlacement } from "@/types/examination";

import { toView } from "./markers";

export type MarkerPart = "target" | "tail";

export interface MarkerInteraction {
  activeNumber: number | null;
  onSelect: (number: number) => void;
  onBeginDrag: (number: number, part: MarkerPart, event: PointerEvent) => void;
  onKeyDown: (number: number, event: KeyboardEvent) => void;
}

function pct(value: number) {
  return `${value * 100}%`;
}

/**
 * Numbered arrows over a signature. Fills its parent, which must show exactly the
 * image's cropped view. Arrow and number sizes stay constant while zooming. Without
 * `interaction` it's a read-only picture for overview pages.
 */
export function MarkerOverlay({
  image,
  markers,
  preview,
  interaction,
  compact = false,
}: {
  image: ExaminationImage;
  markers: ExaminationMarker[];
  /** A placement being dragged, shown instead of the saved one. */
  preview?: { number: number; placement: MarkerPlacement } | null;
  interaction?: MarkerInteraction;
  compact?: boolean;
}) {
  const headId = useId();
  const placed = markers.flatMap((marker) => {
    const placement = preview?.number === marker.number ? preview.placement : marker.placements[image.id];
    return placement ? [{ number: marker.number, target: toView(image, placement.target), tail: toView(image, placement.tail) }] : [];
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg aria-hidden className="absolute inset-0 size-full">
        <defs>
          <marker id={headId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={compact ? 6 : 10} markerHeight={compact ? 6 : 10} markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0 0 10 5 0 10z" className="fill-marker" />
          </marker>
        </defs>
        {placed.map((item) => (
          <line
            key={item.number}
            x1={pct(item.tail.x)}
            y1={pct(item.tail.y)}
            x2={pct(item.target.x)}
            y2={pct(item.target.y)}
            markerEnd={`url(#${headId})`}
            className="stroke-marker"
            strokeWidth={compact ? 1 : 1.75}
          />
        ))}
      </svg>
      {placed.map((item) => {
        const isActive = interaction?.activeNumber === item.number;
        if (!interaction) {
          return (
            <span
              key={item.number}
              aria-hidden
              className="absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-marker bg-white text-[10px] font-bold text-marker tabular"
              style={{ left: pct(item.tail.x), top: pct(item.tail.y) }}
            >
              {item.number}
            </span>
          );
        }
        return (
          <div key={item.number}>
            <span
              data-marker-handle
              aria-hidden
              onPointerDown={(event) => interaction.onBeginDrag(item.number, "target", event)}
              className="pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              style={{ left: pct(item.target.x), top: pct(item.target.y) }}
            >
              {isActive ? <span className="size-3.5 rounded-full border-2 border-marker" /> : null}
            </span>
            <button
              type="button"
              data-marker-handle
              aria-label={`Marker ${item.number} on ${image.label}. Arrow keys move the point. Shift and arrow keys move the number. Delete removes it from this signature.`}
              aria-pressed={isActive}
              onClick={() => interaction.onSelect(item.number)}
              onPointerDown={(event) => interaction.onBeginDrag(item.number, "tail", event)}
              onKeyDown={(event) => interaction.onKeyDown(item.number, event)}
              className={cn(
                "pointer-events-auto absolute flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border-2 border-marker text-[13px] font-bold tabular active:cursor-grabbing",
                isActive ? "bg-marker text-white" : "bg-white text-marker",
              )}
              style={{ left: pct(item.tail.x), top: pct(item.tail.y) }}
            >
              {item.number}
            </button>
          </div>
        );
      })}
    </div>
  );
}
