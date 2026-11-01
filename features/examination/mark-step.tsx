"use client";

import { ChevronLeft, ChevronRight, Grid3x3, Maximize, Plus, Trash2, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { useExaminationsStore } from "@/stores/examinations";
import type { Examination, ExaminationImage, ExaminationMarker, MarkerPlacement } from "@/types/examination";

import { CroppedImage } from "./cropped-image";
import { MarkerOverlay, type MarkerPart } from "./marker-overlay";
import {
  fromView,
  isTargetInView,
  missingPlacements,
  placementAt,
  toView,
  viewAspect,
  withNewMarker,
  withoutMarker,
  withoutPlacement,
  withPlacement,
} from "./markers";
import { SignatureStrip } from "./signature-strip";
import { ZoomViewport } from "./zoom-viewport";

const DRAG_THRESHOLD = 4;
const KEY_STEP = 0.005;

function currentMarkers() {
  return useExaminationsStore.getState().current?.markers ?? [];
}

function saveMarkers(markers: ExaminationMarker[]) {
  useExaminationsStore.getState().update({ markers });
}

function MarkStage({
  image,
  url,
  markers,
  activeNumber,
  onSelect,
  onPlaced,
}: {
  image: ExaminationImage;
  url: string | undefined;
  markers: ExaminationMarker[];
  activeNumber: number | null;
  onSelect: (number: number) => void;
  onPlaced: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ number: number; part: MarkerPart; start: MarkerPlacement } | null>(null);
  const [preview, setPreview] = useState<{ number: number; placement: MarkerPlacement } | null>(null);

  const viewPoint = (clientX: number, clientY: number) => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height };
  };

  const onBeginDrag = (number: number, part: MarkerPart, event: PointerEvent) => {
    const start = markers.find((marker) => marker.number === number)?.placements[image.id];
    if (!start) return;
    event.stopPropagation();
    try {
      stageRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an enhancement; dragging still works without it.
    }
    drag.current = { number, part, start };
    onSelect(number);
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const point = fromView(image, viewPoint(event.clientX, event.clientY));
    setPreview({ number: state.number, placement: { ...state.start, [state.part]: point } });
  };

  const endDrag = () => {
    if (!drag.current) return;
    const { number } = drag.current;
    drag.current = null;
    if (preview?.number === number) saveMarkers(withPlacement(currentMarkers(), number, image.id, preview.placement));
    setPreview(null);
  };

  // Tapping the signature places the selected marker when it isn't on this one yet.
  const onClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-marker-handle]")) return;
    const marker = markers.find((item) => item.number === activeNumber);
    if (!marker || marker.placements[image.id]) return;
    saveMarkers(withPlacement(currentMarkers(), marker.number, image.id, placementAt(image, viewPoint(event.clientX, event.clientY))));
    onPlaced();
  };

  const onKeyDown = (number: number, event: KeyboardEvent) => {
    const placement = markers.find((marker) => marker.number === number)?.placements[image.id];
    if (!placement) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      saveMarkers(withoutPlacement(currentMarkers(), number, image.id));
      return;
    }
    const delta = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const part: MarkerPart = event.shiftKey ? "tail" : "target";
    const point = toView(image, placement[part]);
    const moved = fromView(image, { x: point.x + delta[0], y: point.y + delta[1] });
    saveMarkers(withPlacement(currentMarkers(), number, image.id, { ...placement, [part]: moved }));
  };

  const activeMissing = markers.some((marker) => marker.number === activeNumber && !marker.placements[image.id]);

  return (
    <div
      ref={stageRef}
      data-mark-stage
      className={cn("absolute inset-0 bg-white select-none", activeMissing && "cursor-crosshair")}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <CroppedImage image={image} url={url} alt={`${image.label} signature`} className="size-full" />
      <MarkerOverlay
        image={image}
        markers={markers}
        preview={preview}
        interaction={{ activeNumber, onSelect, onBeginDrag, onKeyDown }}
      />
    </div>
  );
}

/** Which marker is on which signature. Any cell opens that pair. */
function MarkerChecklist({
  examination,
  activeImageId,
  activeNumber,
  onOpen,
}: {
  examination: Examination;
  activeImageId: string;
  activeNumber: number | null;
  onOpen: (imageId: string, number: number) => void;
}) {
  const { images, markers } = examination;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12.5px]">
        <thead>
          <tr>
            <th scope="col" className="w-7 pb-1 text-left font-semibold text-ink-3">
              <span className="sr-only">Marker</span>
            </th>
            {images.map((image) => (
              <th key={image.id} scope="col" className={cn("w-7 pb-1 text-center font-semibold tabular", image.id === activeImageId ? "text-brand-strong" : "text-ink-3")}>
                {image.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {markers.map((marker) => (
            <tr key={marker.number}>
              <th scope="row" className={cn("text-left font-bold tabular", marker.number === activeNumber ? "text-marker" : "text-ink-2")}>
                {marker.number}
              </th>
              {images.map((image) => {
                const placement = marker.placements[image.id];
                const outside = placement && !isTargetInView(image, placement);
                const state = !placement ? "missing" : outside ? "outside the crop" : "placed";
                return (
                  <td key={image.id} className="p-0 text-center">
                    <button
                      type="button"
                      aria-label={`Marker ${marker.number} on ${image.label}: ${state}`}
                      title={`Marker ${marker.number} on ${image.label}: ${state}`}
                      onClick={() => onOpen(image.id, marker.number)}
                      className="flex size-7 items-center justify-center rounded-sm hover:bg-sunken"
                    >
                      <span
                        className={cn(
                          "size-3 rounded-full",
                          !placement ? "border border-line-strong bg-surface" : outside ? "border-2 border-caution bg-caution-soft" : "bg-marker",
                        )}
                      />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllSignatures({
  examination,
  imageUrls,
  onOpen,
}: {
  examination: Examination;
  imageUrls: Record<string, string>;
  onOpen: (imageId: string) => void;
}) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {examination.images.map((image) => {
        const questioned = image.role === "questioned";
        return (
          <button key={image.id} type="button" onClick={() => onOpen(image.id)} className="pressable group block text-left" aria-label={`Open ${image.label} to mark`}>
            <span className={cn("mb-1.5 block text-[13px] font-semibold tabular", questioned ? "text-brand-strong" : "text-ink")}>
              {image.label}
              {questioned ? " Questioned" : ""}
            </span>
            <span
              className={cn("relative block overflow-hidden rounded-md border", questioned ? "border-2 border-brand" : "border-line-strong group-hover:border-ink-4")}
              style={{ aspectRatio: viewAspect(image) }}
            >
              <CroppedImage image={image} url={imageUrls[image.id]} alt={`${image.label} with its markers`} className="size-full" />
              <MarkerOverlay image={image} markers={examination.markers} compact />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MarkPanel({ examination }: { examination: Examination }) {
  const imageUrls = useExaminationsStore((state) => state.imageUrls);
  const { images, markers } = examination;
  const [view, setView] = useState<"one" | "all">("one");
  const [activeImageId, setActiveImageId] = useState(images[0]?.id);
  const [activeNumber, setActiveNumber] = useState<number | null>(markers[0]?.number ?? null);
  const [ghost, setGhost] = useState<{ number: number; x: number; y: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const chipDrag = useRef<{ number: number; x: number; y: number; moved: boolean } | null>(null);

  const index = Math.max(0, images.findIndex((image) => image.id === activeImageId));
  const active = images[index];
  const activeMarker = markers.find((marker) => marker.number === activeNumber) ?? null;
  const missing = missingPlacements(examination);

  const addMarker = () => {
    const { number, markers: next } = withNewMarker(currentMarkers());
    saveMarkers(next);
    setActiveNumber(number);
    setView("one");
  };

  const openPair = (imageId: string, number: number) => {
    setActiveImageId(imageId);
    setActiveNumber(number);
    setView("one");
  };

  // After placing, the next marker this signature still needs is ready to go.
  const selectNextMissing = () => {
    const next = currentMarkers().find((marker) => !marker.placements[active.id]);
    if (next) setActiveNumber(next.number);
  };

  const placeAt = (number: number, viewPoint: { x: number; y: number }) => {
    saveMarkers(withPlacement(currentMarkers(), number, active.id, placementAt(active, viewPoint)));
    setActiveNumber(number);
  };

  const onChipPointerDown = (number: number, event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    chipDrag.current = { number, x: event.clientX, y: event.clientY, moved: false };
  };

  const onChipPointerMove = (event: PointerEvent) => {
    const state = chipDrag.current;
    if (!state) return;
    if (!state.moved && Math.hypot(event.clientX - state.x, event.clientY - state.y) < DRAG_THRESHOLD) return;
    state.moved = true;
    setGhost({ number: state.number, x: event.clientX, y: event.clientY });
  };

  const onChipPointerUp = (event: PointerEvent) => {
    const state = chipDrag.current;
    chipDrag.current = null;
    setGhost(null);
    if (!state?.moved) return;
    // Pointer capture means the drop target has to be looked up by position.
    const stage = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-mark-stage]");
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    placeAt(state.number, { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
  };

  const palette = (
    <div className="flex flex-wrap items-center gap-1.5">
      {markers.map((marker) => {
        const isActive = marker.number === activeNumber;
        return (
          <button
            key={marker.number}
            type="button"
            aria-pressed={isActive}
            aria-label={`Marker ${marker.number}. Drag onto the signature, or select it and tap the signature.`}
            onClick={() => setActiveNumber(marker.number)}
            onPointerDown={(event) => onChipPointerDown(marker.number, event)}
            onPointerMove={onChipPointerMove}
            onPointerUp={onChipPointerUp}
            onPointerCancel={onChipPointerUp}
            className={cn(
              "pressable flex size-8 cursor-grab touch-none items-center justify-center rounded-full border-2 border-marker text-[13px] font-bold tabular active:cursor-grabbing",
              isActive ? "bg-marker text-white" : "bg-white text-marker hover:bg-suspect-soft",
            )}
          >
            {marker.number}
          </button>
        );
      })}
      <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={addMarker}>
        Add marker
      </Button>
    </div>
  );

  const activePlaced = activeMarker?.placements[active.id];

  return (
    <Panel>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3 tabular">
          {markers.length} marker{markers.length === 1 ? "" : "s"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={view === "one" ? <Grid3x3 className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
          onClick={() => setView(view === "one" ? "all" : "one")}
        >
          {view === "one" ? "See all signatures" : "Mark one signature"}
        </Button>
      </div>

      {view === "all" ? (
        <AllSignatures examination={examination} imageUrls={imageUrls} onOpen={(imageId) => openPair(imageId, activeNumber ?? 0)} />
      ) : (
        <>
          <SignatureStrip
            images={images}
            imageUrls={imageUrls}
            activeId={active.id}
            onSelect={setActiveImageId}
            badge={(image) => {
              const count = markers.filter((marker) => marker.placements[image.id]).length;
              return markers.length ? (
                <span className={cn("font-medium", count === markers.length ? "text-marker" : "text-ink-3")}>
                  {count}/{markers.length}
                </span>
              ) : null;
            }}
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              {/* Directly above the signature, so a marker and its drop spot fit on one screen. */}
              <div className="mb-2.5">{palette}</div>
              <ZoomViewport
                key={active.id}
                aspect={viewAspect(active)}
                toolbar={
                  <>
                    <IconButton size="sm" label="Previous signature" disabled={index === 0} onClick={() => setActiveImageId(images[index - 1].id)}>
                      <ChevronLeft className="size-4" />
                    </IconButton>
                    <span className="w-7 text-center text-[13px] font-semibold text-ink tabular">{active.label}</span>
                    <IconButton size="sm" label="Next signature" disabled={index === images.length - 1} onClick={() => setActiveImageId(images[index + 1].id)}>
                      <ChevronRight className="size-4" />
                    </IconButton>
                  </>
                }
              >
                <MarkStage
                  image={active}
                  url={imageUrls[active.id]}
                  markers={markers}
                  activeNumber={activeNumber}
                  onSelect={setActiveNumber}
                  onPlaced={selectNextMissing}
                />
              </ZoomViewport>
              <div className="mt-2.5 flex min-h-8 flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-ink-3">
                  {markers.length === 0
                    ? "Add a marker, then drag it to a stroke feature."
                    : activeMarker && !activePlaced
                      ? `Drag marker ${activeMarker.number} onto ${active.label}, or tap the stroke feature.`
                      : "Drag a number or arrow tip to adjust it."}
                </p>
                {activeMarker ? (
                  <div className="flex items-center gap-1">
                    {activePlaced ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X className="size-4" aria-hidden />}
                        onClick={() => saveMarkers(withoutPlacement(currentMarkers(), activeMarker.number, active.id))}
                      >
                        Remove from {active.label}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => placeAt(activeMarker.number, { x: 0.5, y: 0.5 })}>
                        Place in center
                      </Button>
                    )}
                    <Button variant="danger-ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setPendingDelete(activeMarker.number)}>
                      Delete marker {activeMarker.number}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
            {markers.length ? (
              <aside aria-label="Marker checklist" className="min-w-0">
                <h3 className="text-[13px] font-semibold text-ink">Checklist</h3>
                <p className="mt-0.5 mb-2 text-[12.5px] text-ink-3 tabular">{missing === 0 ? "Every marker is on every signature." : `${missing} still to place`}</p>
                <MarkerChecklist examination={examination} activeImageId={active.id} activeNumber={activeNumber} onOpen={openPair} />
              </aside>
            ) : null}
          </div>
        </>
      )}

      {ghost ? (
        <span
          aria-hidden
          className="pointer-events-none fixed z-50 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-marker bg-marker text-[13px] font-bold text-white shadow-pop tabular"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.number}
        </span>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete === null) return;
          const latest = useExaminationsStore.getState().current;
          if (latest) useExaminationsStore.getState().update(withoutMarker(latest, pendingDelete));
          setActiveNumber(null);
          setPendingDelete(null);
        }}
        tone="danger"
        title={`Delete marker ${pendingDelete ?? ""}?`}
        description="It's removed from every signature, along with its table row. Higher numbers move down by one."
        confirmLabel="Delete marker"
      />
    </Panel>
  );
}
