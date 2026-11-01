"use client";

import { Hand, Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const STAGE_PADDING = 16;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Zoomable, pannable stage for a signature, shared by the crop and mark steps.
 * Children fill a box with the image's aspect ratio, sized so 100% fits the view
 * and zooming keeps the middle of the view in place.
 */
export function ZoomViewport({ aspect, toolbar, children }: { aspect: number; toolbar?: ReactNode; children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => setBox({ width: scroller.clientWidth, height: scroller.clientHeight }));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const changeZoom = useCallback((update: (zoom: number) => number) => {
    const scroller = scrollerRef.current;
    if (scroller) {
      anchor.current = {
        x: (scroller.scrollLeft + scroller.clientWidth / 2) / scroller.scrollWidth,
        y: (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight,
      };
    }
    setZoom((value) => clampZoom(update(value)));
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !anchor.current) return;
    scroller.scrollLeft = anchor.current.x * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTop = anchor.current.y * scroller.scrollHeight - scroller.clientHeight / 2;
    anchor.current = null;
  }, [zoom]);

  // Ctrl + wheel (and trackpad pinch) zooms; a plain wheel keeps scrolling.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom((value) => value * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [changeZoom]);

  const availableWidth = Math.max(0, box.width - STAGE_PADDING * 2);
  const availableHeight = Math.max(0, box.height - STAGE_PADDING * 2);
  const fitWidth = Math.min(availableWidth, availableHeight * aspect);
  const width = fitWidth * zoom;

  return (
    <div className="overflow-hidden rounded-md border border-line-strong">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-canvas px-2 py-1.5">
        <IconButton size="sm" label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom((value) => value / ZOOM_STEP)}>
          <Minus className="size-4" />
        </IconButton>
        <span className="w-12 text-center text-[12.5px] font-medium text-ink-2 tabular" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton size="sm" label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom((value) => value * ZOOM_STEP)}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton size="sm" label="Fit to view" disabled={zoom === 1} onClick={() => changeZoom(() => 1)}>
          <Maximize2 className="size-4" />
        </IconButton>
        <IconButton
          size="sm"
          label={panMode ? "Stop moving the view" : "Move the view"}
          aria-pressed={panMode}
          className={cn(panMode && "bg-brand-soft text-brand-strong hover:bg-brand-soft")}
          onClick={() => setPanMode((value) => !value)}
        >
          <Hand className="size-4" />
        </IconButton>
        {toolbar ? <div className="ml-auto flex items-center gap-1">{toolbar}</div> : null}
      </div>
      <div
        ref={scrollerRef}
        className={cn("h-[min(58dvh,560px)] overflow-auto bg-sunken", panMode && "cursor-grab touch-none select-none active:cursor-grabbing")}
        onPointerDown={(event) => {
          if (!panMode) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pan.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        }}
        onPointerMove={(event) => {
          if (!pan.current) return;
          event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
          event.currentTarget.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
      >
        <div className="flex min-h-full w-max min-w-full" style={{ padding: STAGE_PADDING }}>
          <div
            className={cn("relative m-auto shrink-0", panMode && "pointer-events-none")}
            style={{ width, height: width / aspect, visibility: width > 0 ? "visible" : "hidden" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
