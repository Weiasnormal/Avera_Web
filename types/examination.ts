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
  /** Hand-adjusted chart crops. Other cells are generated around the marker's point. */
  chartFrames: Record<string, NormalizedRect>;
  /** How much of the signature this row's generated crops show; 1 by default. */
  chartScale?: number;
}

export interface FindingsColumn {
  id: string;
  title: string;
  /** Set when the column follows an image; null for columns like Remarks. */
  imageId: string | null;
  /** The remarks column offers preset wording. */
  isRemarks?: boolean;
  /** Renamed by the examiner, so the title no longer follows the image's label. */
  customTitle?: boolean;
}

export interface FindingsRow {
  id: string;
  title: string;
  /** Set when the row follows a marker. */
  markerNumber: number | null;
  cells: Record<string, string>;
  /** Renamed by the examiner, so the title no longer follows the marker's number. */
  customTitle?: boolean;
}

export interface FindingsTable {
  columns: FindingsColumn[];
  rows: FindingsRow[];
  /** Heading of the first column. */
  rowHeader?: string;
  /** Set once automatic rows and columns have been built. */
  synced?: boolean;
  /** Automatic columns and rows the examiner removed; they stay out until restored. */
  dismissedImageIds?: string[];
  dismissedMarkers?: number[];
}

export const EXAMINATION_STEP_IDS = ["images", "crop", "mark", "chart", "general", "specific", "conclusion"] as const;
export type ExaminationStepId = (typeof EXAMINATION_STEP_IDS)[number];

export interface ExaminationAiResult {
  verdict: "Genuine" | "Suspected";
  confidence: number | null;
  distance: number;
  threshold: number;
  revealedAt: string;
  /** The conclusion as it stood when the AI result was first seen or last kept. */
  conclusionAtReveal: string;
  /** Standards added after the analysis that the examiner chose to keep the result for. */
  acceptedExtraImageIds?: string[];
}

/** The signatures and crops the linked AI analysis actually compared. */
export interface AiBasis {
  questioned: { imageId: string; crop: NormalizedRect | null };
  references: { imageId: string; crop: NormalizedRect | null }[];
}

export interface Examination {
  id: string;
  /** A tutorial examination with made-up signatures. Removed on leaving; never linked to AI. */
  isPractice?: boolean;
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
  aiBasis?: AiBasis | null;
  /** Copied when revealed, after the conclusion is written. */
  aiResult?: ExaminationAiResult | null;
  includeAiResult: boolean;
  letterhead: { lines: string[]; logoImageId: string | null };
  signOff: { name: string; title: string; credentials: string; useSignatureImage: boolean; notedBy?: string };
  lastStep: ExaminationStepId;
  createdAt: string;
  updatedAt: string;
}

export type ExaminationPatch = Partial<Omit<Examination, "id" | "version" | "createdAt" | "updatedAt">>;
