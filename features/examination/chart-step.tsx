"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/feedback/states";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { useExaminationsStore } from "@/stores/examinations";
import type { Examination, ExaminationImage, ExaminationMarker, NormalizedRect } from "@/types/examination";

import { CropStage } from "./crop-step";
import { CroppedImage } from "./cropped-image";
import { CHART_SCALE_MAX, CHART_SCALE_MIN, CHART_SCALE_STEP, chartFrameFor, withChartFrame, withChartScale } from "./markers";
import { ZoomViewport } from "./zoom-viewport";

function columnTitle(image: ExaminationImage) {
  return image.role === "questioned" ? "Questioned" : `Standard ${image.label.slice(1)}`;
}

function saveFrame(number: number, imageId: string, frame: NormalizedRect | null) {
  const store = useExaminationsStore.getState();
  if (store.current) store.update({ markers: withChartFrame(store.current.markers, number, imageId, frame) });
}

function AdjustCell({
  image,
  marker,
  url,
  onClose,
}: {
  image: ExaminationImage;
  marker: ExaminationMarker;
  url: string | undefined;
  onClose: () => void;
}) {
  const adjusted = Boolean(marker.chartFrames[image.id]);
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`Marker ${marker.number} on ${image.label}`}
      description="Drag the frame or its corners to choose what this cell shows."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={!adjusted}
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => saveFrame(marker.number, image.id, null)}
          >
            Use automatic crop
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <ZoomViewport aspect={image.width / image.height}>
        {/* Resetting to automatic has to redraw the frame, so the key follows that state. */}
        <CropStage
          key={adjusted ? "adjusted" : "automatic"}
          image={image}
          url={url}
          frame={chartFrameFor(image, marker)}
          onCommit={(frame) => saveFrame(marker.number, image.id, frame)}
        />
      </ZoomViewport>
    </Dialog>
  );
}

export function ChartPanel({ examination }: { examination: Examination }) {
  const pathname = usePathname();
  const imageUrls = useExaminationsStore((state) => state.imageUrls);
  const [editing, setEditing] = useState<{ imageId: string; number: number } | null>(null);
  const { images, markers } = examination;
  const markHref = `${pathname}?step=mark`;

  const placedMarkers = markers.filter((marker) => Object.keys(marker.placements).length > 0);
  const adjustedCount = markers.reduce((total, marker) => total + Object.keys(marker.chartFrames).length, 0);
  const missingCount = placedMarkers.reduce((total, marker) => total + images.filter((image) => !marker.placements[image.id]).length, 0);

  if (placedMarkers.length === 0) {
    return (
      <Panel>
        <EmptyState
          compact
          title="No markers to compare yet"
          description="Each marker you place becomes a row here, with a close-up from every signature."
          action={<ButtonLink href={markHref}>Mark strokes</ButtonLink>}
        />
      </Panel>
    );
  }

  const scaleRow = (number: number, factor: number) => {
    const store = useExaminationsStore.getState();
    if (store.current) store.update({ markers: withChartScale(store.current.markers, number, factor) });
  };

  const editingImage = images.find((image) => image.id === editing?.imageId);
  const editingMarker = markers.find((marker) => marker.number === editing?.number);

  return (
    <Panel>
      <p className="mb-3 text-[13px] text-ink-3 tabular">
        {placedMarkers.length} row{placedMarkers.length === 1 ? "" : "s"}, {images.length} signatures
        {adjustedCount ? `, ${adjustedCount} adjusted by hand` : ""}
        {missingCount ? `, ${missingCount} not marked` : ""}. Select a close-up to adjust it.
      </p>
      <div className="overflow-x-auto rounded-md border border-line-strong">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-canvas">
              <th scope="col" className="sticky left-0 z-10 w-24 border-b border-line-strong bg-canvas px-2 py-2 text-left font-semibold text-ink-3 shadow-[1px_0_0_var(--color-line-strong)]">
                Marker
              </th>
              {images.map((image) => (
                <th
                  key={image.id}
                  scope="col"
                  className={cn(
                    "min-w-28 border-b border-l border-line-strong px-2 py-2 text-center font-semibold whitespace-nowrap",
                    image.role === "questioned" ? "text-brand-strong" : "text-ink",
                  )}
                >
                  {columnTitle(image)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placedMarkers.map((marker) => {
              const scale = marker.chartScale ?? 1;
              return (
                <tr key={marker.number}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-2 py-2 text-left align-middle shadow-[1px_0_0_var(--color-line-strong)]">
                    <span className="flex size-7 items-center justify-center rounded-full border-2 border-marker text-[13px] font-bold text-marker tabular">
                      {marker.number}
                    </span>
                    <span className="mt-1.5 flex">
                      <IconButton size="sm" label={`Show less around marker ${marker.number}`} disabled={scale <= CHART_SCALE_MIN} onClick={() => scaleRow(marker.number, 1 / CHART_SCALE_STEP)}>
                        <Plus className="size-4" />
                      </IconButton>
                      <IconButton size="sm" label={`Show more around marker ${marker.number}`} disabled={scale >= CHART_SCALE_MAX} onClick={() => scaleRow(marker.number, CHART_SCALE_STEP)}>
                        <Minus className="size-4" />
                      </IconButton>
                    </span>
                  </th>
                  {images.map((image) => {
                    const frame = chartFrameFor(image, marker);
                    const adjusted = Boolean(marker.chartFrames[image.id]);
                    const questioned = image.role === "questioned";
                    return (
                      <td key={image.id} className="border-b border-l border-line p-1.5">
                        {frame ? (
                          <button
                            type="button"
                            aria-label={`Adjust marker ${marker.number} on ${image.label}`}
                            onClick={() => setEditing({ imageId: image.id, number: marker.number })}
                            className={cn(
                              "pressable relative block w-full overflow-hidden rounded-sm border",
                              questioned ? "border-brand" : "border-line-strong hover:border-ink-4",
                            )}
                          >
                            <CroppedImage
                              image={image}
                              url={imageUrls[image.id]}
                              region={frame}
                              alt={`Marker ${marker.number} on ${image.label}`}
                              className="aspect-square w-full"
                            />
                            {adjusted ? (
                              <span className="absolute right-1 bottom-1 rounded-sm bg-surface/90 px-1 text-[11px] font-semibold text-ink-2">Adjusted</span>
                            ) : null}
                          </button>
                        ) : (
                          <Link
                            href={markHref}
                            className="flex aspect-square w-full items-center justify-center rounded-sm border border-dashed border-line-strong px-1 text-center text-[12px] font-medium text-ink-3 hover:border-ink-4 hover:text-ink"
                          >
                            Not marked
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingImage && editingMarker ? (
        <AdjustCell image={editingImage} marker={editingMarker} url={imageUrls[editingImage.id]} onClose={() => setEditing(null)} />
      ) : null}
    </Panel>
  );
}
