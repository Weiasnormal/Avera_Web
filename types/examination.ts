// A manual signature examination: the digital form of the examiner's paper
// worksheet. Positions are stored from 0 to 1 against the original image, so
// crops, zoom and the exported PDF all derive from one value.

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect extends NormalizedPoint {
  width: number;
  height: number;
}

export type ExaminationImageRole = "questioned" | "standard";

export interface ExaminationImage {
  id: string;
  role: ExaminationImageRole;
  /** Q1, S1, S2... */
  label: string;
  order: number;
  sourceName: string;
  /** Pixel size of the original, kept for layout and the exported PDF. */
  width: number;
  height: number;
  crop: NormalizedRect | null;
}

export interface MarkerPlacement {
  target: NormalizedPoint;
  tail: NormalizedPoint;
}

/** One feature: the same number marks the same place on every image. */
export interface ExaminationMarker {
  number: number;
  placements: Record<string, MarkerPlacement>;
  chartFrames: Record<string, NormalizedRect>;
}

export interface FindingsColumn {
  id: string;
  title: string;
  /** Set when the column follows an image; null for columns like Remarks. */
  imageId: string | null;
}

export interface FindingsRow {
  id: string;
  title: string;
  /** Set when the row follows a marker. */
  markerNumber: number | null;
  cells: Record<string, string>;
}

export interface FindingsTable {
  columns: FindingsColumn[];
  rows: FindingsRow[];
}

export const EXAMINATION_STEP_IDS = ["images", "crop", "mark", "chart", "general", "specific", "conclusion"] as const;
export type ExaminationStepId = (typeof EXAMINATION_STEP_IDS)[number];

export interface Examination {
  id: string;
  /** Raised on every save. A stale version is rejected, so two tabs can't overwrite each other. */
  version: number;
  caseId: string | null;
  caseNumber: string;
  caseName: string;
  images: ExaminationImage[];
  markers: ExaminationMarker[];
  generalFindings: FindingsTable;
  specificFindings: FindingsTable;
  conclusion: string;
  includeAiResult: boolean;
  letterhead: { lines: string[]; logoImageId: string | null };
  signOff: { name: string; title: string; credentials: string; useSignatureImage: boolean };
  lastStep: ExaminationStepId;
  createdAt: string;
  updatedAt: string;
}

export type ExaminationPatch = Partial<Omit<Examination, "id" | "version" | "createdAt" | "updatedAt">>;
