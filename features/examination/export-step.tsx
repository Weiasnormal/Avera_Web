"use client";

import { Download, FileText, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { triggerDownload } from "@/features/results/report-actions";
import { ACCEPTED_IMAGE_EXTENSIONS, ImageValidationError, toPng, validateImageFile } from "@/lib/image";
import { safeFileSegment } from "@/lib/format";
import { examinationRepository } from "@/services/examinations";
import { useExaminationsStore } from "@/stores/examinations";
import { useSessionStore } from "@/stores/session";
import { toast } from "@/stores/toast";
import type { Examination } from "@/types/examination";

import { currentAiResult } from "./ai-basis";
import { missingPlacements } from "./markers";
import { logoImageId, signatureImageId } from "./model";
import type { ExaminationReport } from "./report-pdf";

function currentUserId() {
  return useSessionStore.getState().claims?.userId ?? "";
}

function reportFileName(examination: Examination) {
  // A timestamp keeps each export distinct, so a newer file can't be mistaken for an older one.
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Examination_Report_${safeFileSegment(examination.caseNumber.trim() || examination.id)}_${stamp}.pdf`;
}

/** Generates the PDF on demand. pdf-lib loads only when it's needed. */
async function buildReport(examination: Examination): Promise<ExaminationReport> {
  const { buildExaminationReport } = await import("./report-pdf");
  await useExaminationsStore.getState().flush();
  return buildExaminationReport(examination, currentUserId());
}

/** Things worth checking before printing. None of them block the download. */
function reportWarnings(examination: Examination) {
  const warnings: string[] = [];
  if (!examination.caseName.trim()) warnings.push("The case has no name.");
  if (!examination.caseNumber.trim()) warnings.push("The case has no number.");
  if (examination.markers.length === 0) warnings.push("No markers are placed, so the comparison chart is empty.");
  const missing = missingPlacements(examination);
  if (examination.markers.length && missing) warnings.push(`${missing} marker placement${missing === 1 ? " is" : "s are"} still missing.`);
  if (!examination.conclusion.trim()) warnings.push("The conclusion is empty.");
  if (!examination.signOff.name.trim()) warnings.push("The examiner's name is empty.");
  return warnings;
}

export function ReportActions({ examination, size = "md" }: { examination: Examination; size?: "sm" | "md" }) {
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string[]>([]);

  const announce = (fileName: string) => {
    const withAi = examination.includeAiResult && currentAiResult(examination);
    toast.success(`Downloaded ${withAi ? "with" : "without"} the AI result: ${fileName}`);
  };

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const run = async (kind: "preview" | "download") => {
    setBusy(kind);
    setError(null);
    try {
      const report = await buildReport(examination);
      setUnsupported(report.unsupportedCharacters);
      if (kind === "preview") setPreview({ url: URL.createObjectURL(report.blob), blob: report.blob });
      else {
        const fileName = reportFileName(examination);
        triggerDownload(report.blob, fileName);
        announce(fileName);
      }
    } catch (buildError) {
      setError(buildError instanceof Error && buildError.message ? buildError.message : "The report couldn't be created. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const characterNote = unsupported.length ? (
    <Alert tone="caution" className="mb-3">
      These characters can&apos;t be printed and appear as &quot;?&quot; in the report: {unsupported.join(" ")}
    </Alert>
  ) : null;

  return (
    <>
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {preview ? null : characterNote}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size={size} disabled={busy !== null} loading={busy === "preview"} icon={<FileText className="size-4" aria-hidden />} onClick={() => void run("preview")}>
          Preview report
        </Button>
        <Button size={size} disabled={busy !== null} loading={busy === "download"} icon={<Download className="size-4" aria-hidden />} onClick={() => void run("download")}>
          Download PDF
        </Button>
      </div>
      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        size="full"
        title="Examination report"
        description="Check the pages, then download."
        bodyClassName="px-0 sm:px-0 pb-0"
        footer={
          <Button
            icon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              if (!preview) return;
              const fileName = reportFileName(examination);
              triggerDownload(preview.blob, fileName);
              announce(fileName);
            }}
          >
            Download PDF
          </Button>
        }
      >
        {characterNote ? <div className="px-5 pt-1">{characterNote}</div> : null}
        {preview ? <iframe src={preview.url} title="Examination report preview" className="h-[70dvh] w-full border-y border-line bg-sunken" /> : null}
      </Dialog>
    </>
  );
}

/** Upload, show and remove a small image kept per user on this device. */
function StoredImageField({
  label,
  hint,
  imageId,
  onChange,
}: {
  label: string;
  hint: string;
  imageId: string;
  onChange: (present: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void examinationRepository.getImage(currentUserId(), imageId).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageId]);

  const add = async (file: File) => {
    setError(null);
    try {
      validateImageFile(file);
      const png = await toPng(file);
      await examinationRepository.putImage(currentUserId(), "profile", imageId, png);
      setUrl(URL.createObjectURL(png));
      onChange(true);
    } catch (addError) {
      setError(addError instanceof ImageValidationError ? addError.message : "This image couldn't be saved. Try another one.");
    }
  };

  const remove = async () => {
    await examinationRepository.removeImage(currentUserId(), imageId);
    setUrl(null);
    onChange(false);
  };

  return (
    <div>
      <p className="text-[13px] font-semibold text-ink">{label}</p>
      <p className="mb-1.5 text-[12.5px] text-ink-3">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void add(file);
        }}
      />
      {error ? <Alert className="mb-2">{error}</Alert> : null}
      <div className="flex items-center gap-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={url} alt={label} className="h-12 max-w-40 rounded-sm border border-line-strong bg-white object-contain p-1" />
        ) : null}
        <Button variant="secondary" size="sm" icon={<ImagePlus className="size-4" aria-hidden />} onClick={() => inputRef.current?.click()}>
          {url ? "Replace" : "Upload"}
        </Button>
        {url ? (
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ExportPanel({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  const organization = useSessionStore((state) => state.profile?.organization ?? "");
  const examinerName = useSessionStore((state) => `${state.profile?.firstName ?? ""} ${state.profile?.lastName ?? ""}`.trim());
  const userId = useSessionStore((state) => state.claims?.userId ?? "");
  const { letterhead, signOff } = examination;
  const warnings = reportWarnings(examination);
  const prefilled = useRef(false);

  // The first report starts from the organization and profile; later ones reuse the last used details.
  useEffect(() => {
    if (prefilled.current || letterhead.lines.length || signOff.name) return;
    prefilled.current = true;
    void examinationRepository.list(userId).then((items) => {
      const previous = items.find((item) => item.id !== examination.id && (item.letterhead.lines.length || item.signOff.name));
      const store = useExaminationsStore.getState();
      if (previous) store.update({ letterhead: previous.letterhead, signOff: previous.signOff });
      else store.update({ letterhead: { ...letterhead, lines: organization ? [organization] : [] }, signOff: { ...signOff, name: examinerName } });
    });
  }, [examination.id, examinerName, letterhead, organization, signOff, userId]);

  const setSignOff = (patch: Partial<Examination["signOff"]>) => update({ signOff: { ...signOff, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Report details" description="Saved for your next report on this device.">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <TextAreaField
              label="Letterhead"
              hint="One line per row, centered at the top of the report."
              value={letterhead.lines.join("\n")}
              onChange={(event) => update({ letterhead: { ...letterhead, lines: event.target.value.split("\n") } })}
            />
            <StoredImageField
              label="Logo"
              hint="Optional. Shown above the letterhead."
              imageId={logoImageId(userId)}
              onChange={(present) => update({ letterhead: { ...letterhead, logoImageId: present ? logoImageId(userId) : null } })}
            />
          </div>
          <div className="flex flex-col gap-4">
            <TextField label="Examiner's name" value={signOff.name} maxLength={120} onChange={(event) => setSignOff({ name: event.target.value })} />
            <TextField
              label="Credentials"
              optional
              placeholder="PhD, RCrim"
              value={signOff.credentials}
              maxLength={120}
              onChange={(event) => setSignOff({ credentials: event.target.value })}
            />
            <TextAreaField label="Title" optional hint="One line per row, under your name." value={signOff.title} onChange={(event) => setSignOff({ title: event.target.value })} />
            <TextField label="Noted by" optional value={signOff.notedBy ?? ""} maxLength={80} onChange={(event) => setSignOff({ notedBy: event.target.value })} />
            <StoredImageField
              label="Signature"
              hint="Optional. Without one, the report has a line to sign after printing."
              imageId={signatureImageId(userId)}
              onChange={(present) => setSignOff({ useSignatureImage: present })}
            />
          </div>
        </div>
      </Panel>
      <Panel title="Your report">
        {warnings.length ? (
          <Alert tone="caution" className="mb-4" title="Check before printing">
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <ReportActions examination={examination} />
      </Panel>
    </div>
  );
}
