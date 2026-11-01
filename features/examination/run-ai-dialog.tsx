"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/feedback/states";
import { useCaseLimit } from "@/components/navigation/new-analysis-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { useCases } from "@/hooks/use-cases";
import { cn } from "@/lib/cn";
import { toPng } from "@/lib/image";
import { routes } from "@/lib/routes";
import { examinationRepository } from "@/services/examinations";
import { useAnalysisStore, type SignatureImage } from "@/stores/analysis";
import { useExaminationsStore } from "@/stores/examinations";
import { useSessionStore } from "@/stores/session";
import { DOCUMENT_TYPES, PRIORITIES, type AnalysisPriority, type DocumentType } from "@/types/case";
import type { Examination, ExaminationImage } from "@/types/examination";

import { CroppedImage } from "./cropped-image";

const AI_REFERENCES = 4;

/** The model takes exactly 4 references, so examiners with more choose which go in. */
export function RunAiDialog({ examination, onClose }: { examination: Examination; onClose: () => void }) {
  const router = useRouter();
  useCases();
  const { reached } = useCaseLimit();
  const imageUrls = useExaminationsStore((state) => state.imageUrls);
  const standards = examination.images.filter((image) => image.role === "standard");
  const questioned = examination.images.find((image) => image.role === "questioned");
  const [selected, setSelected] = useState(() => standards.slice(0, AI_REFERENCES).map((image) => image.id));
  const [subjectName, setSubjectName] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("Bank cheque");
  const [otherDocumentType, setOtherDocumentType] = useState("");
  const [priority, setPriority] = useState<AnalysisPriority>("Medium");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length < AI_REFERENCES ? [...current, id] : current));

  const detailsValid = subjectName.trim().length > 1 && (documentType !== "Other" || otherDocumentType.trim().length > 0);
  const canRun = selected.length === AI_REFERENCES && detailsValid && Boolean(questioned) && !reached;

  const toSignature = async (image: ExaminationImage): Promise<SignatureImage> => {
    const userId = useSessionStore.getState().claims?.userId ?? "";
    const original = await examinationRepository.getImage(userId, image.id);
    if (!original) throw new Error(`${image.label} couldn't be read from this device.`);
    const blob = await toPng(original, image.crop);
    return { blob, previewUrl: URL.createObjectURL(blob), sourceName: image.sourceName };
  };

  const run = async () => {
    if (!canRun || !questioned) return;
    setRunning(true);
    setError(null);
    try {
      const chosen = standards.filter((image) => selected.includes(image.id));
      const [suspect, ...references] = await Promise.all([questioned, ...chosen].map(toSignature));
      // The normal analysis pipeline, in a fresh draft so one in progress isn't lost.
      const analysis = useAnalysisStore.getState();
      analysis.startNewDraft();
      analysis.updateDraft({ subjectName: subjectName.trim(), documentType, otherDocumentType, priority });
      references.forEach((image, index) => analysis.setImage("reference", index, image));
      analysis.setImage("suspect", 0, suspect);
      await analysis.submit((caseId) => {
        const store = useExaminationsStore.getState();
        store.update({ caseId });
        void store.flush();
        onClose();
        router.push(routes.examiner.processing(caseId));
      });
    } catch (runError) {
      useAnalysisStore.getState().discardDraft();
      setError(runError instanceof Error ? runError.message : "The analysis couldn't be started. Try again.");
      setRunning(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!running}
      size="lg"
      title="Run AI analysis"
      footer={
        <>
          <Button variant="secondary" disabled={running} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canRun} loading={running} onClick={() => void run()}>
            Run analysis
          </Button>
        </>
      }
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {reached ? <Alert className="mb-3">Contact your admin. Your case limit has been reached.</Alert> : null}
      <Alert tone="info" className="mb-4" title={`AI uses only ${AI_REFERENCES} references`}>
        {standards.length > AI_REFERENCES
          ? `Your examination has ${standards.length} standards. Choose the ${AI_REFERENCES} the model should compare with the questioned signature.`
          : `The model compares the questioned signature with these ${AI_REFERENCES} standards.`}{" "}
        Your crops are applied.
      </Alert>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink tabular">
          References: {selected.length} of {AI_REFERENCES} chosen
        </legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {standards.map((image) => {
            const isChosen = selected.includes(image.id);
            const isBlocked = !isChosen && selected.length >= AI_REFERENCES;
            return (
              <label
                key={image.id}
                className={cn(
                  "relative block cursor-pointer overflow-hidden rounded-sm border has-focus-visible:outline-2 has-focus-visible:outline-brand",
                  isChosen ? "border-brand ring-1 ring-brand" : "border-line-strong",
                  isBlocked && "cursor-not-allowed opacity-50",
                )}
              >
                <input type="checkbox" className="sr-only" checked={isChosen} disabled={isBlocked} onChange={() => toggle(image.id)} />
                <CroppedImage image={image} url={imageUrls[image.id]} alt={`${image.label} preview`} className="aspect-4/3 w-full" />
                <span className="flex items-center justify-between border-t border-line px-1.5 py-1 text-[12.5px] font-semibold text-ink tabular">
                  {image.label}
                  {isChosen ? <Check className="size-3.5 text-brand" aria-hidden /> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 pb-1 sm:grid-cols-2">
        <TextField
          label="Subject name"
          className="sm:col-span-2"
          value={subjectName}
          maxLength={120}
          onChange={(event) => setSubjectName(event.target.value)}
        />
        <SelectField label="Document type" value={documentType} options={DOCUMENT_TYPES} onChange={setDocumentType} />
        <SelectField label="Priority" value={priority} options={PRIORITIES} onChange={setPriority} />
        {documentType === "Other" ? (
          <TextField
            label="Which document type?"
            className="sm:col-span-2"
            value={otherDocumentType}
            maxLength={80}
            onChange={(event) => setOtherDocumentType(event.target.value)}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
