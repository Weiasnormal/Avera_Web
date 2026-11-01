import type { Examination, ExaminationStepId, FindingsTable } from "@/types/examination";

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
    case "chart":
      return examination.markers.some((marker) => Object.keys(marker.chartFrames).length > 0);
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
