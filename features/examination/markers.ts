import type {
  Examination,
  ExaminationImage,
  ExaminationMarker,
  FindingsTable,
  MarkerPlacement,
  NormalizedPoint,
  NormalizedRect,
} from "@/types/examination";

// Marker numbers are shared: marker N is one feature on every signature. Positions
// are stored against the original image. The "view" is the cropped part on screen.

const FULL: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function viewRect(image: Pick<ExaminationImage, "crop">): NormalizedRect {
  return image.crop ?? FULL;
}

/** Width over height of what's on screen, in pixels. */
export function viewAspect(image: ExaminationImage) {
  const rect = viewRect(image);
  return (rect.width * image.width) / (rect.height * image.height);
}

export function toView(image: ExaminationImage, point: NormalizedPoint): NormalizedPoint {
  const rect = viewRect(image);
  return { x: (point.x - rect.x) / rect.width, y: (point.y - rect.y) / rect.height };
}

export function fromView(image: ExaminationImage, point: NormalizedPoint): NormalizedPoint {
  const rect = viewRect(image);
  return { x: rect.x + clamp(point.x) * rect.width, y: rect.y + clamp(point.y) * rect.height };
}

/** A later crop can leave a marker's point outside the frame. */
export function isTargetInView(image: ExaminationImage, placement: MarkerPlacement) {
  const point = toView(image, placement.target);
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/** New arrows come in from above and left, flipping when the point is near that edge. */
export function placementAt(image: ExaminationImage, viewPoint: NormalizedPoint): MarkerPlacement {
  const x = viewPoint.x - 0.1 < 0.04 ? viewPoint.x + 0.1 : viewPoint.x - 0.1;
  const y = viewPoint.y - 0.22 < 0.06 ? viewPoint.y + 0.22 : viewPoint.y - 0.22;
  return { target: fromView(image, viewPoint), tail: fromView(image, { x, y }) };
}

const CHART_VIEW_SHARE = 0.3;
export const CHART_SCALE_STEP = 1.25;
export const CHART_SCALE_MIN = 0.5;
export const CHART_SCALE_MAX = 2.5;

/** A square close-up centered on the marker's point, kept inside the crop where it can be. */
export function automaticChartFrame(image: ExaminationImage, placement: MarkerPlacement, scale = 1): NormalizedRect {
  const view = viewRect(image);
  const viewWidth = view.width * image.width;
  const viewHeight = view.height * image.height;
  const side = Math.min(viewWidth * CHART_VIEW_SHARE * scale, viewWidth, viewHeight);
  const width = side / image.width;
  const height = side / image.height;
  return {
    x: clamp(placement.target.x - width / 2, view.x, view.x + view.width - width),
    y: clamp(placement.target.y - height / 2, view.y, view.y + view.height - height),
    width,
    height,
  };
}

export function chartFrameFor(image: ExaminationImage, marker: ExaminationMarker): NormalizedRect | null {
  const placement = marker.placements[image.id];
  if (!placement) return null;
  return marker.chartFrames[image.id] ?? automaticChartFrame(image, placement, marker.chartScale);
}

export function withChartFrame(markers: ExaminationMarker[], number: number, imageId: string, frame: NormalizedRect | null) {
  return markers.map((marker) => {
    if (marker.number !== number) return marker;
    const chartFrames = { ...marker.chartFrames };
    if (frame) chartFrames[imageId] = frame;
    else delete chartFrames[imageId];
    return { ...marker, chartFrames };
  });
}

export function withChartScale(markers: ExaminationMarker[], number: number, factor: number) {
  return markers.map((marker) =>
    marker.number === number
      ? { ...marker, chartScale: clamp((marker.chartScale ?? 1) * factor, CHART_SCALE_MIN, CHART_SCALE_MAX) }
      : marker,
  );
}

export function withNewMarker(markers: ExaminationMarker[]) {
  const number = markers.reduce((highest, marker) => Math.max(highest, marker.number), 0) + 1;
  return { number, markers: [...markers, { number, placements: {}, chartFrames: {} }] };
}

export function withPlacement(markers: ExaminationMarker[], number: number, imageId: string, placement: MarkerPlacement) {
  return markers.map((marker) =>
    marker.number === number ? { ...marker, placements: { ...marker.placements, [imageId]: placement } } : marker,
  );
}

export function withoutPlacement(markers: ExaminationMarker[], number: number, imageId: string) {
  return markers.map((marker) => {
    if (marker.number !== number) return marker;
    const placements = { ...marker.placements };
    const chartFrames = { ...marker.chartFrames };
    delete placements[imageId];
    delete chartFrames[imageId];
    return { ...marker, placements, chartFrames };
  });
}

/** Numbers stay continuous, so later markers and their table rows move down by one. */
export function withoutMarker(examination: Pick<Examination, "markers" | "specificFindings">, number: number) {
  const shift = (value: number) => (value > number ? value - 1 : value);
  const specificFindings: FindingsTable = {
    ...examination.specificFindings,
    rows: examination.specificFindings.rows
      .filter((row) => row.markerNumber !== number)
      .map((row) => {
        if (row.markerNumber === null) return row;
        const markerNumber = shift(row.markerNumber);
        return { ...row, markerNumber, title: row.title === String(row.markerNumber) ? String(markerNumber) : row.title };
      }),
  };
  return {
    markers: examination.markers
      .filter((marker) => marker.number !== number)
      .map((marker) => ({ ...marker, number: shift(marker.number) })),
    specificFindings,
  };
}

export function missingPlacements(examination: Pick<Examination, "markers" | "images">) {
  return examination.markers.reduce(
    (total, marker) => total + examination.images.filter((image) => !marker.placements[image.id]).length,
    0,
  );
}
