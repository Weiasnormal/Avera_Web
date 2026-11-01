# Examination feature: audit log and backend handoff

Living record of what changed for the Examination page and what the backend must provide. Update it in every build step.

- **Branch:** `feat/examination-workspace`, created from `feat/web-migration`
- **Status:** All 10 build steps complete. Ready for the owner's real-backend test (section 7) before merging. Saving still uses the temporary on-device storage (section 3) until the backend endpoints (section 4) exist.
- **Commits:** made by the project owner after each approved step.

## 1. Confirmed decisions

| Topic | Decision |
| --- | --- |
| Page | "Examination" in the examiner sidebar, at `/examinations` |
| Access | Examiners only, private to the author. Admin read-only review comes after the backend exists |
| Source | Start from an existing Avera case, or start blank and upload |
| Images | Exactly 1 questioned plus 4 to 8 references, examiner-tagged (5 to 9 images). Later steps stay locked until 1 questioned and 4 references are added |
| Markers | Shared numbers: marker N is one feature on every image, and each marker is one table row |
| Chart crops | Generated around each marker, and any cell can be re-framed by hand |
| Tables | Rows come from markers and columns from images. "Same for all standards" fills across. Rows and columns can be added, removed, renamed and reordered |
| Steps | 1 Case and images, 2 Crop, 3 Mark strokes, 4 Comparison chart, 5 General findings, 6 Specific findings, 7 Conclusion and export. All steps are freely reachable once the image minimum is met |
| AI result | Hidden until the conclusion is written. Excluded from the PDF unless the examiner opts in |
| AI analysis | Offered after the conclusion on blank-start examinations. Shows a notice that AI uses 4 references, and a picker for which 4 |
| Changed signatures | Owner rule: if the signatures or crops the linked case compared were changed, that case's result doesn't apply. It is hidden and left out of the PDF, and a separate analysis creates a new case. The original case is untouched. Extra standards beyond the analyzed ones don't count as a change |
| PDF identity | Organization letterhead and optional logo, with a small "Prepared with Avera" footer |
| Sign-off | Upload a signature image, or leave a line to sign after printing. Name, title and credentials are editable |
| Tutorial | First-visit tour, replayable, plus a practice examination that isn't saved |
| Devices | Full editing at 768px and wider. Phones can view and download only |
| Saving | Browser storage now, behind a single save interface, then the backend |

## 2. Implementation decisions

| Topic | Decision | Reason |
| --- | --- | --- |
| Canvas | React with DOM and SVG, no canvas library | Matches the existing crop dialogs, and keeps markers accessible and resolution independent |
| Coordinates | Normalized 0 to 1 against the original image | Crops, zoom and PDF output all derive from one stored position |
| Crop | Non-destructive: keep the original image and a crop rectangle | Examiners can always return and change the crop |
| PDF | Generated in the browser with `pdf-lib`, a new dependency added at the PDF step | Selectable text, exact page control, and no server needed |
| Marker color | Red by default, as in the scans | Matches examiner convention |
| Remarks and conclusion | Blank by default, with presets to choose from | A preset verdict would bias the opinion |

## 3. Known risk: temporary browser storage

The app previously kept no case data in browser storage (see the note at the top of `stores/analysis.ts`). The project owner approved a temporary exception for this feature.

- Signature images and findings are stored unencrypted in IndexedDB on the device, keyed by user ID.
- Work is kept after sign-out, or it would be lost before the backend exists. Anyone with access to that browser profile could reach the data, so **shared computers are a real exposure**.
- Work does not sync between devices, and clearing browser data deletes it.
- The UI must state "Saved on this device only" until the backend ships.

Remove this exception, and the local copies, when the backend save layer goes live.

## 4. Backend endpoints needed (proposed)

None of these exist yet. Paths follow the existing `/cases` style, and names can change with the backend team. All require authentication and tenant checks. Only the author can write in this phase.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/examinations?page&pageSize` | List the caller's examinations |
| `POST` | `/examinations` | Create one, with optional `caseId` |
| `GET` | `/examinations/{id}` | Get the full document with image URLs |
| `PUT` | `/examinations/{id}` | Save the document. Requires `version`; returns `409` if stale |
| `DELETE` | `/examinations/{id}` | Delete an examination and its files |
| `POST` | `/examinations/{id}/images` | Upload an original image as multipart. Returns `imageId` |
| `GET` | `/examinations/{id}/images/{imageId}` | Fetch an image, tenant-checked |
| `DELETE` | `/examinations/{id}/images/{imageId}` | Remove an image |
| `PUT` | `/examiners/me/signature` | Store the examiner's signature image |
| `GET` | `/examiners/me/signature` | Fetch it, self only |
| `DELETE` | `/examiners/me/signature` | Remove it |
| `GET` | `/organizations/me/letterhead` | Get letterhead lines and logo |
| `PUT` | `/organizations/me/letterhead` | Update them. Permission rule to be decided |
| `POST` | `/examinations/{id}/analysis` | Create a linked case from 1 questioned and 4 chosen references |

The last one is optional. The browser can reach the same result with the existing `createCase`, `uploadSignature` and `runAnalysis` calls, but a single call is safer against partial failure.

### Document shape

Source of truth: `types/examination.ts`. The frontend switch point is `examinationRepository` at the bottom of `services/examinations.ts`; nothing else touches storage. `lastStep` is also saved, so examiners return to where they left off. The current implementation already enforces the `version` conflict rule.

```ts
interface Examination {
  id: string;
  version: number;
  caseId: string | null;
  caseNumber: string;
  caseName: string;
  images: {
    id: string;
    role: "questioned" | "standard";
    label: string; // Q1, S1, S2...
    order: number;
    crop: { x: number; y: number; width: number; height: number } | null;
  }[];
  markers: {
    number: number;
    placements: Record<string, {
      target: { x: number; y: number };
      tail: { x: number; y: number };
    }>;
    chartFrames: Record<string, { x: number; y: number; width: number; height: number }>;
  }[];
  generalFindings: Table;
  specificFindings: Table;
  conclusion: string;
  includeAiResult: boolean;
  letterhead: { lines: string[]; logoImageId: string | null };
  signOff: { name: string; title: string; credentials: string; useSignatureImage: boolean };
  updatedAt: string;
}

interface Table {
  columns: { id: string; title: string; imageId: string | null }[];
  rows: { id: string; title: string; markerNumber: number | null; cells: Record<string, string> }[];
}
```

### Backend considerations

- `aiBasis` must be stored with the document: it records which images and crops the linked case compared. If the backend adds an analysis endpoint, it should set this field itself. Linking an examination to a new case replaces `caseId`, and the earlier case stays as it is.
- The examiner's signature and logo are stored per user, under image ids `signature-{userId}` and `logo-{userId}`, and map to the `/examiners/me/signature` and letterhead endpoints above. A signature image is sensitive, so it needs the same protection as other credentials of identity.
- PDFs are generated in the browser with standard fonts, which print Western characters only. Other characters print as "?" and the examiner is told. Supporting more scripts means embedding a font.
- Starting from a case currently downloads the 5 signatures through the existing signature endpoints and copies them into the examination. A server-side copy would be better once `POST /examinations` exists, for example by accepting `caseId` and copying the files there.
- Evidence retention, deletion and audit policy need an owner.
- Whether to keep a version history of signed opinions is undecided.
- Downloaded PDFs are not recorded anywhere unless the backend adds an export log.

## 5. Change log

| Step | Date | Change | Files |
| --- | --- | --- | --- |
| 0 | 2026-11-01 | Created branch, product record and this audit file | `PRODUCT.md`, `docs/examination/AUDIT.md` |
| 1 | 2026-11-01 | Added data model and save layer with autosave and two-tab conflict protection | `types/examination.ts`, `services/examinations.ts`, `stores/examinations.ts`, `features/examination/model.ts` |
| 1 | 2026-11-01 | Added list page, workspace, 7-step navigation and phone summary | `app/(examiner)/examinations/**`, `features/examination/examination-list.tsx`, `examination-workspace.tsx`, `examination-stepper.tsx` |
| 1 | 2026-11-01 | Added sidebar item and route, and protected the route as examiner-only | `components/navigation/app-shell.tsx`, `lib/routes.ts`, `proxy.ts` |
| 1 | 2026-11-01 | Sign-out now saves pending edits and clears the in-memory copy. Saved work stays on the device | `components/providers/session-provider.tsx` |
| 2 | 2026-11-01 | Added image store actions: add with validation, remove with cascade to markers and columns, set questioned, reorder | `stores/examinations.ts`, `features/examination/model.ts`, `types/examination.ts` |
| 2 | 2026-11-01 | Added case details and all-signatures sheet | `features/examination/images-step.tsx`, `examination-workspace.tsx` |
| 2 | 2026-11-01 | Added new-examination dialog with blank and from-case starts. The case list hides status and verdict to protect the blind examination | `features/examination/new-examination-dialog.tsx`, `examination-list.tsx` |
| 2 | 2026-11-01 | Added case signature download | `services/cases.ts` (`downloadCaseSignatures`) |
| 2 | 2026-11-01 | Added optional `title` prop to the shared evidence image | `components/ui/evidence-image.tsx` |
| 2 | 2026-11-01 | Owner change: 1 questioned and 4 standards are required before later steps open. Enforced in the stepper, Next button and saved or linked positions | `features/examination/model.ts`, `examination-stepper.tsx`, `examination-workspace.tsx`, `images-step.tsx` |
| 3 | 2026-11-01 | Added crop step with non-destructive frames, keyboard support, and a shared zoom and pan viewport for Step 4 | `features/examination/crop-step.tsx`, `zoom-viewport.tsx`, `cropped-image.tsx` |
| 4 | 2026-11-01 | Added mark step: drag or tap numbered arrows, adjustable point and number, checklist, all-signatures view, keyboard support | `features/examination/mark-step.tsx`, `marker-overlay.tsx`, `markers.ts` |
| 4 | 2026-11-01 | Moved the signature row into a shared component and added a marker color token | `features/examination/signature-strip.tsx`, `crop-step.tsx`, `app/globals.css` |
| 5 | 2026-11-01 | Added comparison chart: generated close-ups, per-row show more or less, per-cell adjust and reset. Added optional `chartScale` to markers. The crop stage now accepts any frame | `features/examination/chart-step.tsx`, `markers.ts`, `crop-step.tsx`, `model.ts`, `types/examination.ts` |
| 6 | 2026-11-01 | Added General and Specific findings: automatic rows and columns, same text for all standards, remarks presets with own wording, rename, move, add, remove and restore | `features/examination/findings.ts`, `findings-editor.tsx`, `findings-steps.tsx`, `types/examination.ts`, `markers.ts` |
| 6 | 2026-11-01 | Fixed the new-examination dialog staying open on the hidden list page after starting | `features/examination/new-examination-dialog.tsx` |
| 7 | 2026-11-01 | Added conclusion with optional starting wording, AI result locked until a conclusion exists, a saved copy of the result, a note when the conclusion changes afterwards, and a report opt-in | `features/examination/conclusion-step.tsx`, `types/examination.ts` |
| 7 | 2026-11-01 | Added AI run for unlinked examinations: 4-reference notice and picker, crops applied, sent through the existing analysis pipeline, examination linked to the new case | `features/examination/run-ai-dialog.tsx` |
| 7 fix | 2026-11-01 | Owner-reported bug: results stayed on the original case after signatures changed. Added `aiBasis` tracking and Run separate analysis | `features/examination/ai-basis.ts`, `conclusion-step.tsx`, `run-ai-dialog.tsx`, `new-examination-dialog.tsx`, `types/examination.ts` |
| 8 | 2026-11-01 | Added PDF report in the scanned layout, report details, preview, download and phone download. Added `pdf-lib`, loaded on demand | `features/examination/report-pdf.ts`, `export-step.tsx`, `model.ts`, `examination-workspace.tsx`, `features/results/report-actions.tsx`, `package.json` |
| 8 fix | 2026-11-01 | Owner report: include box seemed ignored. Could not be reproduced: a second download did contain the result. Made files unique with a timestamp, added a confirmation naming whether the AI result is in, and made the AI section a table | `features/examination/export-step.tsx`, `report-pdf.ts` |
| 8 fix | 2026-11-01 | Owner request: Keep this result or Run new analysis when the conclusion was edited or standards were added afterwards. Added notes for standards the analysis didn't compare, and a new analysis option at all times | `features/examination/conclusion-step.tsx`, `ai-basis.ts`, `types/examination.ts` |
| 9 | 2026-11-01 | Added first-visit overview, per-step spotlight tips with Show tips, and a practice examination with drawn signatures, no AI, a practice notice on the PDF, and removal on returning to the list | `features/examination/tutorial.tsx`, `practice.ts`, `examination-list.tsx`, `examination-workspace.tsx`, `crop-step.tsx`, `mark-step.tsx`, `stores/examinations.ts` |
| 9 fix | 2026-11-02 | Owner report: practice showed real report details, tips didn't reopen, Crop had no check. Practice now has made-up details and its own signature and logo slots; tips restart per practice run; Crop is checked after moving on, with a note that cropping is optional | `features/examination/practice.ts`, `tutorial.tsx`, `export-step.tsx`, `model.ts`, `crop-step.tsx`, `examination-workspace.tsx`, `report-pdf.ts`, `types/examination.ts` |
| 10 | 2026-11-02 | Final pass: PDF no longer cuts off long case names or names, letterhead wraps; tour focus starts on Next so Enter advances; divider on fixed table columns; removed step placeholders | `features/examination/report-pdf.ts`, `tutorial.tsx`, `findings-editor.tsx`, `chart-step.tsx`, `examination-workspace.tsx` |

Owner-requested end of flow (2026-11-02): `finishedAt` is stored on the document. Finishing requires a conclusion, closes editing and opens a finished screen; Reopen to edit clears it. The backend should store it and, when examinations are shared, decide who may reopen one.

## 7. Owner's test before merging

These can't be checked with the mock setup:

1. Sign in for real, start from a real case, and confirm its signatures load.
2. Replace a signature, and run a separate analysis through the real AI pipeline. Confirm the new case's result appears, and that crops reached the model.
3. Download a PDF, then tick Include AI result and download again. The confirmation should say "with", and that newest file should contain the table.
4. Print a report on paper.
5. Try marking and cropping with touch or a stylus on a tablet.
6. Review the wording: conclusion starters and remark presets are this build's own, not an examiner's.
7. Hit the case limit once, and confirm the message appears in the Run analysis dialog.
8. Sign out and back in, and confirm work returns for that user and doesn't show for another.
| 10 add | 2026-11-02 | Owner request: checklist always shown so its tip works; Finish examination with confirmation; finished screens; Finished status in the list | `features/examination/finish-step.tsx`, `mark-step.tsx`, `tutorial.tsx`, `examination-workspace.tsx`, `examination-list.tsx`, `export-step.tsx`, `types/examination.ts` |

## 6. Verification log

| Step | Checked | Result |
| --- | --- | --- |
| 1 | Create, edit, autosave, leave and return, resume at last step, delete, conflict blocks overwrite; layouts at 768px and 375px. Run against a local mock backend with a local test session | Pass |
| 2 | Production build. From-case import, blank start, upload, 9-image limit, rejected file message logic, reorder, questioned swap, remove, large view, restored after reload. Same mock setup | Pass |
| 2 (change) | Later steps locked with missing questioned or standards, message counts down, Next disabled, direct `?step=crop` link blocked, unlocks at 1 questioned and 4 standards | Pass |
| 3 | Mouse drag to draw, keyboard move and resize, frames kept per signature, Use full image, zoom keeps its place, crop restored after leaving and returning, 768px layout | Pass |
| 4 | Mouse: drag marker on, tap to place, drag number, drag point. Keyboard moves. Checklist counts and states, including a marker outside a later crop. All-signatures view. Delete with renumbering. Removing a marked image asks first and relocks steps. Crop corner and frame dragging | Pass |
| 5 | Empty state, generated cells, Not marked cells, show more per row, adjust with a mouse, Adjusted label, reset to automatic. Marking while zoomed lands on the exact point. Chart and mark layouts at 768px | Pass |
| 6 | Automatic columns and rows, copy across standards and overwrite warning, remarks preset and own wording, remove with warning, restore, add, reorder, typed text growing the cell, all restored after reload | Pass |
| 7 | AI hidden before a conclusion, no verdict text on the page, reveal shows model values, change note, opt-in. With 6 standards: picker enforces 4, Run disabled until valid, mock received 1 questioned and 4 references, examination linked to the case | Pass |
| 7 fix | Replacing a standard from a case hides the old result, blocks Reveal, offers Run separate analysis. New run links the new case with 4 references and clears the old result. A ticked include box doesn't print a stale result | Pass |
| 8 | Real PDFs rendered and read page by page: 5 and 9 signatures, letterhead, logo, signature, chart, long cell across pages, repeated headings, conclusion, AI note, marked signatures, accented characters | Pass |
| 8 fix | Export, tick include, export again: second PDF contains the AI section. Added then removed a standard: note appears then clears. Edited conclusion: Keep clears it. Timestamped name and confirmation shown | Pass |
| 9 | Overview on first visit, practice start, spotlight on step tips, tips shown once per step, Show tips replays, no AI in practice, practice and its images removed on leaving, real examination untouched | Pass |
| 9 fix | A seeded real signature doesn't appear in practice; fake details fill in; tips open on all 7 steps and again on a new run; tips seen in practice don't repeat in real examinations; Crop check appears after leaving; practice notice on every PDF page; practice images removed, real signature kept | Pass |
| 10 | 9 signatures, 14 markers; delete and add a marker with table text; long names and unbroken words; unprintable characters warned; PDF pagination; Ctrl + wheel event zooms; hand tool pans; keyboard through the tour; How it works; failed AI run shows an error and links nothing; 768px chart and findings; 375px summary and PDF generation with no sideways overflow | Pass |
| 10 add | Checklist always present, so its tip highlights it. Finish disabled without a conclusion; warnings in the confirmation; practice and real finished screens; Finished badge; a finished examination opens to that screen; reopen keeps the work | Pass |

Superseded by the rows above: earlier "not yet checked" notes for Ctrl + wheel, hand tool, 9-column chart, 768px findings, marker changes, tips, the PDF practice notice, How it works, keyboard tour and unprintable characters.

Not yet checked for Step 9: the tips on Crop, Chart, General and Specific, the PDF practice notice, "How it works" reopening the overview, and keyboard use of the tour.

Not yet checked for Step 8: the final signature line order (drawn on top; built and compiled only), a downloaded file through the browser's save flow, the phone download button, characters the font can't print, printing on paper. Conclusion wording doesn't update if signatures are added afterwards. The page order of the scans was inferred, as the scans arrived unordered.

Conclusion wordings and remark presets are this build's wording. Not yet checked for Step 7: the real AI pipeline, a failed run, the case limit message, a run with crops (mock doesn't inspect uploads).

Remark presets (Significant difference, Similar, Not comparable) are this build's wording and need the owner's or an examiner's review. Not yet checked for Step 6: 768px layout, sticky first column with many columns, marker changes updating an existing table.

Not yet checked for Steps 3 to 5: Ctrl + wheel zoom, the Move the view tool, a 9-column chart, and real touch or stylus input.

Not yet checked: drag and drop of real files with a mouse (tested through the file input only), the rejected-file message after its last fix, real sign-in, real backend, and a real second tab (the conflict was simulated by changing the stored version).
