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
