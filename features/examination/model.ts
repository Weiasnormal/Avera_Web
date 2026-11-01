import type { Examination, ExaminationImage, ExaminationStepId, FindingsTable } from "@/types/examination";

export const MAX_EXAMINATION_IMAGES = 9;
export const MIN_STANDARDS = 4;

export interface ExaminationStep {
  id: ExaminationStepId;
  label: string;
  title: string;
  description: string;
}

/** Follows the page order of a paper examination report. Every step stays reachable. */
export const EXAMINATION_STEPS: readonly ExaminationStep[] = [
  {
    id: "images",
    label: "Images",
    title: "Case and images",
    description: "Name the case and add the questioned signature and its standards.",
  },
  { id: "crop", label: "Crop", title: "Crop signatures", description: "Frame each signature. You can return and change a crop at any time." },
  { id: "mark", label: "Mark", title: "Mark strokes", description: "Point numbered arrows at the same stroke feature on every signature." },
  { id: "chart", label: "Chart", title: "Comparison chart", description: "Check the close-up of each marked feature, side by side." },
  { id: "general", label: "General", title: "General findings", description: "Describe the standards and the questioned signature as a whole." },
  { id: "specific", label: "Specific", title: "Specific findings", description: "Describe each marked point, signature by signature." },
  { id: "conclusion", label: "Conclusion", title: "Conclusion and export", description: "Write your opinion, then preview and download the report." },
];

const STARTER_GENERAL_ROWS = ["General information", "Relation to baseline", "Line quality", "Proportion and spacing", "Variation"];

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function starterGeneralFindings(): FindingsTable {
  return {
    columns: [
      { id: newId(), title: "Standard specimen", imageId: null },
      { id: newId(), title: "Questioned specimen", imageId: null },
    ],
    rows: STARTER_GENERAL_ROWS.map((title) => ({ id: newId(), title, markerNumber: null, cells: {} })),
  };
}

/** Findings and the conclusion start blank: nothing suggests an opinion to the examiner. */
export function createExamination(): Examination {
  const now = new Date().toISOString();
  return {
    id: newId(),
    version: 0,
    caseId: null,
    caseNumber: "",
    caseName: "",
    images: [],
    markers: [],
    generalFindings: starterGeneralFindings(),
    specificFindings: { columns: [], rows: [] },
    conclusion: "",
    includeAiResult: false,
    letterhead: { lines: [], logoImageId: null },
    signOff: { name: "", title: "", credentials: "", useSignatureImage: false },
    lastStep: "images",
    createdAt: now,
    updatedAt: now,
  };
}

/** Questioned first, then standards in the examiner's order, with labels to match. */
export function arrangeImages(images: ExaminationImage[]): ExaminationImage[] {
  const questioned = images.filter((image) => image.role === "questioned");
  const standards = images.filter((image) => image.role === "standard");
  return [
    ...questioned.map((image, index) => ({ ...image, label: `Q${index + 1}` })),
    ...standards.map((image, index) => ({ ...image, label: `S${index + 1}` })),
  ].map((image, order) => ({ ...image, order }));
}

/** Everything that points at an image goes with it. */
export function withoutImage(examination: Examination, imageId: string) {
  const dropColumn = (table: FindingsTable): FindingsTable => ({
    ...table,
    columns: table.columns.filter((column) => column.imageId !== imageId),
  });
  return {
    images: arrangeImages(examination.images.filter((image) => image.id !== imageId)),
    markers: examination.markers.map((marker) => {
      const placements = { ...marker.placements };
      const chartFrames = { ...marker.chartFrames };
      delete placements[imageId];
      delete chartFrames[imageId];
      return { ...marker, placements, chartFrames };
    }),
    generalFindings: dropColumn(examination.generalFindings),
    specificFindings: dropColumn(examination.specificFindings),
  };
}

/** What's still missing before the steps after Images open; null when nothing is. */
export function missingForExamination(examination: Pick<Examination, "images">): string | null {
  const hasQuestioned = examination.images.some((image) => image.role === "questioned");
  const standards = examination.images.filter((image) => image.role === "standard").length;
  const needed = Math.max(0, MIN_STANDARDS - standards);
  const standardsText = `${needed} more standard${needed === 1 ? "" : "s"}`;
  if (!hasQuestioned && needed > 0) return `Add the questioned signature and ${standardsText} to continue.`;
  if (!hasQuestioned) return "Add the questioned signature to continue.";
  return needed > 0 ? `Add ${standardsText} to continue.` : null;
}

export function isImageMarked(examination: Examination, imageId: string) {
  return examination.markers.some((marker) => marker.placements[imageId]);
}

/** Kept per user, so an examiner's signature follows them to each examination on this device. */
export function signatureImageId(userId: string) {
  return `signature-${userId}`;
}

export function logoImageId(userId: string) {
  return `logo-${userId}`;
}

export function examinationTitle(examination: Pick<Examination, "caseName">) {
  return examination.caseName.trim() || "Untitled examination";
}

function hasCellText(table: FindingsTable) {
  return table.rows.some((row) => Object.values(row.cells).some((text) => text.trim().length > 0));
}

/** Whether a step holds any of the examiner's work; drives the checkmarks in the stepper. */
export function isStepStarted(examination: Examination, step: ExaminationStepId) {
  switch (step) {
    case "images":
      return examination.images.length > 0;
    case "crop":
      return examination.images.some((image) => image.crop !== null);
    case "mark":
      return examination.markers.some((marker) => Object.keys(marker.placements).length > 0);
    // The chart builds itself from placed markers.
    case "chart":
      return examination.markers.some((marker) => Object.keys(marker.placements).length > 0);
    case "general":
      return hasCellText(examination.generalFindings);
    case "specific":
      return hasCellText(examination.specificFindings);
    case "conclusion":
      return examination.conclusion.trim().length > 0;
  }
}

export function startedStepCount(examination: Examination) {
  return EXAMINATION_STEPS.filter((step) => isStepStarted(examination, step.id)).length;
}
