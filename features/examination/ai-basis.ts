import type { AiBasis, Examination, ExaminationImage, NormalizedRect } from "@/types/examination";

// Records exactly what the linked AI analysis looked at. A case's result only
// describes those signatures with those crops; anything else needs its own analysis.

function entry(image: ExaminationImage) {
  return { imageId: image.id, crop: image.crop };
}

export function buildAiBasis(questioned: ExaminationImage, references: ExaminationImage[]): AiBasis {
  return { questioned: entry(questioned), references: references.map(entry) };
}

function sameCrop(a: NormalizedRect | null, b: NormalizedRect | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Standards added beyond the analyzed ones don't change what the model compared.
 * Replacing, removing, re-cropping or swapping an analyzed signature does. A case
 * link with no record can't be confirmed, so it counts as changed.
 */
export function hasAiBasisChanged(examination: Pick<Examination, "caseId" | "aiBasis" | "images">) {
  if (!examination.caseId) return false;
  const basis = examination.aiBasis;
  if (!basis) return true;
  const questioned = examination.images.find((image) => image.role === "questioned");
  if (!questioned || questioned.id !== basis.questioned.imageId || !sameCrop(questioned.crop, basis.questioned.crop)) return true;
  return basis.references.some((reference) => {
    const image = examination.images.find((item) => item.id === reference.imageId);
    return !image || image.role !== "standard" || !sameCrop(image.crop, reference.crop);
  });
}

/** Standards added since the analysis, which the model never compared. */
export function standardsOutsideAiBasis(examination: Pick<Examination, "aiBasis" | "images">) {
  const analyzed = examination.aiBasis?.references.map((reference) => reference.imageId) ?? [];
  return examination.images.filter((image) => image.role === "standard" && !analyzed.includes(image.id));
}

/** The AI result to show or print, or null when it no longer describes these signatures. */
export function currentAiResult(examination: Pick<Examination, "caseId" | "aiBasis" | "images" | "aiResult">) {
  return examination.aiResult && !hasAiBasisChanged(examination) ? examination.aiResult : null;
}
