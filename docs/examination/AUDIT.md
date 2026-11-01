# Examination feature: audit log and backend handoff

Living record of what changed for the Examination page and what the backend must provide. Update it in every build step.

- **Branch:** `feat/examination-workspace`, created from `feat/web-migration`
- **Status:** Step 1 (page, stepper, on-device saving) complete. Steps 2 to 10 pending.
- **Commits:** made by the project owner after each approved step.

## 1. Confirmed decisions

| Topic | Decision |
| --- | --- |
| Page | "Examination" in the examiner sidebar, at `/examinations` |
| Access | Examiners only, private to the author. Admin read-only review comes after the backend exists |
| Source | Start from an existing Avera case, or start blank and upload |
| Images | Exactly 1 questioned plus references, examiner-tagged. Maximum 9 in total, 5 to 9 suggested |
| Markers | Shared numbers: marker N is one feature on every image, and each marker is one table row |
| Chart crops | Generated around each marker, and any cell can be re-framed by hand |
| Tables | Rows come from markers and columns from images. "Same for all standards" fills across. Rows and columns can be added, removed, renamed and reordered |
| Steps | 1 Case and images, 2 Crop, 3 Mark strokes, 4 Comparison chart, 5 General findings, 6 Specific findings, 7 Conclusion and export. All steps are freely reachable |
| AI result | Hidden until the conclusion is written. Excluded from the PDF unless the examiner opts in |
| AI analysis | Offered after the conclusion on blank-start examinations. Shows a notice that AI uses 4 references, and a picker for which 4 |
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

## 6. Verification log

| Step | Checked | Result |
| --- | --- | --- |
| 1 | Create, edit, autosave, leave and return, resume at last step, delete, conflict blocks overwrite; layouts at 768px and 375px. Run against a local mock backend with a local test session | Pass |

Not yet checked: real sign-in, real backend, and a real second tab (the conflict was simulated by changing the stored version).
