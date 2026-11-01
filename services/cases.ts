import { normalizePersonDisplay, parseTimeElapsedMs } from "@/lib/format";
import {
  DOCUMENT_TYPE_VALUE,
  FinalVerdict,
  PRIORITY_VALUE,
  type AnalysisPriority,
  type AnalysisRunResult,
  type AnalysisType,
  type CaseDetail,
  type CaseStatus,
  type CaseSummary,
  type CaseWorkflowStatus,
  type DocumentType,
  type GradCamImage,
  type OverlaySlot,
  type OverlayVariant,
} from "@/types/case";

import { ApiError, apiJson, apiRequest, backendUrl, readJson } from "./api/client";
import { API_ENDPOINTS } from "./api/endpoints";

// Normalizers ported from the mobile app (services/backendCases.ts,
// services/caseReviewApi.ts, store/caseStore.ts). The backend may serialize
// enums as numbers or names and properties in camelCase or PascalCase.

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null;
}

function pick(raw: Raw | null | undefined, ...keys: string[]): unknown {
  if (!raw) return undefined;
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true" || value === "1";
  return value === 1;
}

export function normalizeWorkflowStatus(value: unknown): CaseWorkflowStatus {
  if (value === 1 || value === "1" || value === "PendingReview") return "PendingReview";
  if (value === 2 || value === "2" || value === "Reviewed") return "Reviewed";
  return "Processing";
}

export function normalizeFinalVerdict(value: unknown): FinalVerdict | null {
  if (value === null || value === undefined) return null;
  if (value === 0 || value === "0" || value === "None") return FinalVerdict.None;
  if (value === 1 || value === "1" || value === "Genuine") return FinalVerdict.Genuine;
  if (value === 2 || value === "2" || value === "Forged") return FinalVerdict.Forged;
  return null;
}

export function normalizeDocumentType(value: unknown): DocumentType {
  if (value === 0 || value === "0" || value === "BankCheque" || value === "Bank cheque") return "Bank cheque";
  if (value === 1 || value === "1" || value === "PropertyDeed" || value === "Property deed") return "Property deed";
  if (value === 2 || value === "2" || value === "LastWill" || value === "Last will") return "Last will";
  if (value === 3 || value === "3" || value === "Contract") return "Contract";
  if (value === 4 || value === "4" || value === "Affidavit") return "Affidavit";
  return "Other";
}

function normalizePriority(value: unknown, fallback: AnalysisPriority): AnalysisPriority {
  if (value === 0 || value === "0" || value === "Low") return "Low";
  if (value === 1 || value === "1" || value === "Medium") return "Medium";
  if (value === 2 || value === "2" || value === "High") return "High";
  if (value === 3 || value === "3" || value === "Urgent") return "Urgent";
  return fallback;
}

function normalizeAnalysisType(value: unknown): AnalysisType {
  return value === "HW" ? "HW" : value === "DOC" ? "DOC" : "SIG";
}

function normalizeCreator(value: unknown, fallback: string): string {
  if (typeof value === "string") return normalizePersonDisplay(value);
  if (!isRecord(value)) return fallback;
  const name = pick(value, "name", "fullName", "userName", "username", "UserName", "email");
  return typeof name === "string" && name.trim() ? normalizePersonDisplay(name) : fallback;
}

function ownerUserId(raw: Raw): string | undefined {
  const direct = pick(raw, "userId", "UserId", "examinerId", "ExaminerId", "createdByUserId", "CreatedByUserId");
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const creator = pick(raw, "createdByUser", "CreatedByUser");
  if (!isRecord(creator)) return undefined;
  const nested = pick(creator, "id", "Id", "userId", "UserId");
  return typeof nested === "string" && nested.trim() ? nested.trim() : undefined;
}

function creatorField(raw: Raw) {
  return pick(raw, "createdByUser", "CreatedByUser", "examiner", "Examiner", "createdByUserName", "CreatedByUserName");
}

const SLOT_BY_INDEX: OverlaySlot[] = ["Reference1", "Reference2", "Reference3", "Reference4", "Suspected"];
const VARIANT_BY_INDEX: OverlayVariant[] = ["Original", "Heatmap", "Overlay", "BoundingBox", "StrokeDiff"];

function normalizeSlot(value: unknown): OverlaySlot | null {
  if (typeof value === "number" || /^\d+$/.test(String(value ?? ""))) return SLOT_BY_INDEX[Number(value)] ?? null;
  const normalized = String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "suspect" || normalized === "suspected") return "Suspected";
  const reference = normalized.match(/^reference([1-4])$/);
  return reference ? (`Reference${reference[1]}` as OverlaySlot) : null;
}

function normalizeVariant(value: unknown): OverlayVariant | null {
  if (typeof value === "number" || /^\d+$/.test(String(value ?? ""))) return VARIANT_BY_INDEX[Number(value)] ?? null;
  const normalized = String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "strokedifference") return "StrokeDiff";
  return VARIANT_BY_INDEX.find((variant) => variant.toLowerCase() === normalized) ?? null;
}

export function parseGradCamImages(raw: unknown): GradCamImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const imageId = String(pick(item, "imageId", "ImageId", "image_id", "blobId", "BlobId", "id", "Id") ?? "").trim();
    const slot = normalizeSlot(pick(item, "slot", "Slot", "overlaySlot", "OverlaySlot"));
    const variant = normalizeVariant(pick(item, "variant", "Variant", "overlayVariant", "OverlayVariant"));
    return imageId && slot && variant ? [{ imageId, slot, variant }] : [];
  });
}

/** Verdict shown on lists: a reviewer's final verdict overrides the ML verdict. */
function listStatus(raw: Raw, workflowStatus: CaseWorkflowStatus): CaseStatus {
  if (workflowStatus === "Processing") return "Processing";
  const finalVerdict = normalizeFinalVerdict(raw.finalVerdict ?? raw.FinalVerdict);
  if (finalVerdict === FinalVerdict.Forged) return "Suspected";
  if (finalVerdict === FinalVerdict.Genuine) return "Genuine";
  const ml = isRecord(raw.mlResponse) ? raw.mlResponse : null;
  const verdict = String(pick(ml, "verdict", "Verdict") ?? "").toUpperCase();
  if (verdict === "FORGED") return "Suspected";
  if (verdict === "GENUINE") return "Genuine";
  return "Processing";
}

export function normalizeCaseSummary(raw: Raw): CaseSummary | null {
  const caseId = String(pick(raw, "id", "Id") ?? "").trim();
  const createdAt = pick(raw, "createdAt", "CreatedAt");
  if (!caseId || typeof createdAt !== "string") return null;

  const workflowStatus = normalizeWorkflowStatus(pick(raw, "caseStatus", "CaseStatus"));
  const ml = isRecord(raw.mlResponse) ? raw.mlResponse : null;
  const rawConfidence =
    pick(ml, "confidence", "Confidence") ??
    Math.max(
      Number(pick(ml, "confidenceGenuine", "ConfidenceGenuine") ?? 0),
      Number(pick(ml, "confidenceForged", "ConfidenceForged") ?? 0),
    );
  const confidence = Number(rawConfidence);
  const verdict = pick(ml, "verdict", "Verdict");
  const owner = ownerUserId(raw);
  const tenant = pick(raw, "tenantId", "TenantId", "organizationId", "OrganizationId");

  return {
    caseId,
    caseCode: String(pick(raw, "caseCode", "CaseCode") ?? "").trim() || caseId,
    subjectName: String(pick(raw, "subjectName", "SubjectName") ?? "").trim(),
    examiner: normalizeCreator(creatorField(raw), ""),
    ownerUserId: owner,
    tenantId: typeof tenant === "string" ? tenant.trim() : undefined,
    documentType: normalizeDocumentType(pick(raw, "documentType", "DocumentType", "analysisType")),
    otherDocumentType: String(pick(raw, "optionalDocumentType", "OptionalDocumentType") ?? "").trim(),
    priority: normalizePriority(pick(raw, "priority", "Priority"), "Medium"),
    createdAt,
    status: listStatus(raw, workflowStatus),
    workflowStatus,
    analysisType: normalizeAnalysisType(pick(raw, "analysisType", "AnalysisType")),
    verdict: typeof verdict === "string" ? verdict : undefined,
    confidence: Number.isFinite(confidence) && ml ? confidence : undefined,
    isFlaggedForInternalReview: toBoolean(pick(raw, "isFlaggedForInternalReview", "IsFlaggedForInternalReview")),
    resultViewed: workflowStatus !== "Processing" ? toBoolean(pick(raw, "resultViewed", "ResultViewed")) : undefined,
    timeElapsedMs: parseTimeElapsedMs(pick(raw, "timeElapsed", "TimeElapsed")),
  };
}

export function normalizeCaseDetail(raw: Raw): CaseDetail {
  const rootGradCam = pick(raw, "gradCamResults", "GradCamResults", "gradcamImages", "GradcamImages");
  const ml = (pick(raw, "mlResponse", "MLResponse", "MlResponse", "ml_response") ??
    (Array.isArray(rootGradCam) ? raw : null)) as Raw | null;

  return {
    id: String(pick(raw, "id", "Id") ?? ""),
    caseCode: String(pick(raw, "caseCode", "CaseCode") ?? ""),
    subjectName: String(pick(raw, "subjectName", "SubjectName") ?? ""),
    ownerUserId: (pick(raw, "userId", "UserId", "createdByUserId", "CreatedByUserId") as string) ?? null,
    examiner: normalizeCreator(creatorField(raw), "Unknown"),
    priority: normalizePriority(pick(raw, "priority", "Priority"), "Low"),
    createdAt: String(pick(raw, "createdAt", "CreatedAt") ?? ""),
    caseStatus: normalizeWorkflowStatus(pick(raw, "caseStatus", "CaseStatus")),
    documentType: normalizeDocumentType(pick(raw, "documentType", "DocumentType", "analysisType", "AnalysisType")),
    otherDocumentType: String(pick(raw, "optionalDocumentType", "OptionalDocumentType") ?? ""),
    isDeleted: toBoolean(pick(raw, "isDeleted", "IsDeleted")),
    mlResponse: ml
      ? {
          confidenceForged: Number(pick(ml, "confidenceForged", "ConfidenceForged", "confidence_forged") ?? 0),
          confidenceGenuine: Number(pick(ml, "confidenceGenuine", "ConfidenceGenuine", "confidence_genuine") ?? 0),
          distance: Number(pick(ml, "distance", "Distance", "distance_metric") ?? 0),
          threshold: Number(pick(ml, "threshold", "Threshold", "threshold_value") ?? 0),
          verdict: String(pick(ml, "verdict", "Verdict", "verdict_label") ?? ""),
          gradCamResults: parseGradCamImages(
            pick(ml, "gradCamResults", "GradCamResults", "gradcamResults", "gradcamImages", "GradcamImages", "gradcam_images") ??
              rootGradCam,
          ),
        }
      : null,
    reviewedByUserId: (pick(raw, "reviewedByUserId", "ReviewedByUserId") as string) ?? null,
    reviewedAt: (pick(raw, "reviewedAt", "ReviewedAt") as string) ?? null,
    reviewNote: (pick(raw, "reviewNote", "ReviewNote") as string) ?? null,
    finalVerdict: normalizeFinalVerdict(pick(raw, "finalVerdict", "FinalVerdict")),
    // Mobile defaults to allowed when the field is absent.
    isPdfExportAllowed: toBoolean(pick(raw, "isPdfExportAllowed", "IsPdfExportAllowed") ?? true),
    isFlaggedForInternalReview: toBoolean(pick(raw, "isFlaggedForInternalReview", "IsFlaggedForInternalReview")),
    timeElapsedMs: parseTimeElapsedMs(pick(raw, "timeElapsed", "TimeElapsed")),
  };
}

// --- Requests ---------------------------------------------------------------

export interface FetchCasesResult {
  cases: CaseSummary[];
  totalCount: number;
}

/** GET /cases?page&pageSize[&status&priority&type] */
export async function fetchCasesPage(page: number, pageSize: number): Promise<FetchCasesResult> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const payload = await apiJson<unknown>(`${API_ENDPOINTS.cases.list}?${query}`);
  const object = isRecord(payload) && !Array.isArray(payload) ? payload : null;
  const rawCases = Array.isArray(payload) ? payload : pick(object, "cases", "Cases");
  const records = Array.isArray(rawCases) ? (rawCases as Raw[]) : [];
  const total = pick(object, "totalCount", "TotalCount");
  return {
    cases: records.map(normalizeCaseSummary).filter((item): item is CaseSummary => item !== null),
    totalCount: typeof total === "number" ? total : records.length,
  };
}

/** GET /cases/{id}. Rejects cases outside the caller's tenant like the mobile app does. */
export async function fetchCaseDetail(caseId: string, currentTenantId?: string): Promise<CaseDetail> {
  const json = await apiJson<Raw>(API_ENDPOINTS.cases.get(caseId));
  const dto = (pick(json, "case", "Case") ?? json ?? {}) as Raw;
  const caseTenant = pick(dto, "tenantId", "TenantId", "organizationId", "OrganizationId");
  if (currentTenantId && caseTenant && String(caseTenant).trim() !== currentTenantId.trim()) {
    throw new ApiError(403, "WrongTenant", "This case is outside your organization.");
  }
  return normalizeCaseDetail(dto);
}

export async function markCaseViewed(caseId: string): Promise<void> {
  await apiRequest(API_ENDPOINTS.cases.viewed(caseId), { method: "POST" });
}

export interface CreateCaseInput {
  subjectName: string;
  documentType: DocumentType;
  priority: AnalysisPriority;
}

/** POST /cases → { id, caseCode } (falls back to the Location header). */
export async function createCase(input: CreateCaseInput): Promise<{ caseId: string; caseCode: string | null }> {
  const response = await apiRequest(API_ENDPOINTS.cases.create, {
    method: "POST",
    body: {
      SubjectName: input.subjectName,
      DocumentType: DOCUMENT_TYPE_VALUE[input.documentType],
      Priority: PRIORITY_VALUE[input.priority],
    },
  });

  const json = await readJson<unknown>(response.clone()).catch(() => null);
  let caseId: string | null = null;
  let caseCode: string | null = null;
  if (isRecord(json)) {
    caseId = String(pick(json, "id", "Id") ?? "") || null;
    caseCode = (pick(json, "caseCode", "CaseCode") as string) ?? null;
  } else if (typeof json === "string" && json.trim()) {
    caseId = json.trim().replace(/^"|"$/g, "");
  }
  if (!caseId) {
    const location = response.headers.get("location");
    if (location) caseId = location.split("/").filter(Boolean).pop() ?? null;
  }
  if (!caseId) throw new Error("Unable to determine created case id from response");
  return { caseId, caseCode };
}

/** POST /cases/{id}/signatures/{reference|suspected}?index=n with multipart "file". */
export async function uploadSignature(
  caseId: string,
  kind: "reference" | "suspected",
  index: number,
  file: Blob,
  fileName: string,
): Promise<void> {
  const body = new FormData();
  body.append("file", file, fileName);
  const path =
    kind === "reference" ? API_ENDPOINTS.signatures.uploadReference(caseId) : API_ENDPOINTS.signatures.uploadSuspected(caseId);
  await apiRequest(`${path}?index=${index}`, { method: "POST", body, timeoutMs: 120_000 });
}

/** GET /cases/{id}/analysis — runs the ML comparison and returns the ProcessResponse. */
export async function runAnalysis(caseId: string): Promise<AnalysisRunResult> {
  const json = await apiJson<Raw>(API_ENDPOINTS.analysis.start(caseId), {
    headers: { "Cache-Control": "no-cache" },
    timeoutMs: 300_000,
  });
  const verdict = pick(json, "Verdict", "verdict");
  return {
    caseName: String(pick(json, "CaseName", "case_name") ?? caseId),
    verdict: typeof verdict === "string" && verdict ? verdict : null,
    confidenceForged: Number(pick(json, "ConfidenceForged", "confidenceForged", "confidence_forged") ?? 0),
    confidenceGenuine: Number(pick(json, "ConfidenceGenuine", "confidenceGenuine", "confidence_genuine") ?? 0),
    distance: Number(pick(json, "Distance", "distance") ?? 0),
    threshold: Number(pick(json, "Threshold", "threshold") ?? 0),
    overlayImages: parseGradCamImages(
      pick(json, "GradcamImages", "gradcamImages", "gradcam_images", "OverlayImages", "overlayImages", "overlay_images"),
    ),
  };
}

/** PATCH /cases/{id}/status?status=… */
export async function updateCaseStatus(caseId: string, status: CaseWorkflowStatus): Promise<void> {
  await apiRequest(`${API_ENDPOINTS.cases.updateStatus(caseId)}?status=${status}`, { method: "PATCH" });
}

export interface SubmitReviewPayload {
  finalVerdict: FinalVerdict;
  reviewNote: string | null;
  isPdfExportAllowed: boolean;
}

/** POST /cases/{id}/review (Admin). 409 when the case is already reviewed. */
export async function submitCaseReview(caseId: string, payload: SubmitReviewPayload): Promise<void> {
  await apiRequest(API_ENDPOINTS.cases.review(caseId), { method: "POST", body: payload });
}

/** POST /cases/{id}/flag (Admin). */
export async function setInternalReviewFlag(caseId: string, isFlagged: boolean): Promise<void> {
  await apiRequest(API_ENDPOINTS.cases.toggleInternalReviewFlag(caseId), { method: "POST", body: { isFlagged } });
}

/** GET /cases/{id}/results — the backend-generated PDF report. */
export async function downloadReportPdf(caseId: string): Promise<Blob> {
  const response = await apiRequest(`${API_ENDPOINTS.analysis.getResults(caseId)}?downloadedAt=${Date.now()}`, {
    headers: { Accept: "application/pdf", "Cache-Control": "no-cache" },
    timeoutMs: 120_000,
  });
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The PDF report is not ready yet. Please try again.");
  return blob;
}

/** The original signatures of a case, for use in a manual examination. */
export async function downloadCaseSignatures(caseId: string): Promise<{ references: Blob[]; suspected: Blob }> {
  const blobOf = async (path: string) => (await apiRequest(path, { timeoutMs: 120_000 })).blob();
  const [suspected, ...references] = await Promise.all([
    blobOf(API_ENDPOINTS.signatures.getSuspected(caseId, 1)),
    ...[1, 2, 3, 4].map((index) => blobOf(API_ENDPOINTS.signatures.getReference(caseId, index))),
  ]);
  return { references, suspected };
}

// --- Image URLs (served through the proxy with the session cookie) ----------

export const caseImageUrls = {
  reference: (caseId: string, index: number) => backendUrl(API_ENDPOINTS.signatures.getReference(caseId, index)),
  suspected: (caseId: string) => backendUrl(API_ENDPOINTS.signatures.getSuspected(caseId, 1)),
  overlay: (caseId: string, imageId: string) => backendUrl(API_ENDPOINTS.ml.getBlobImage(caseId, imageId)),
};

export function findOverlay(images: GradCamImage[] | undefined, slot: OverlaySlot, variant: OverlayVariant) {
  return images?.find((item) => item.slot === slot && item.variant === variant);
}
