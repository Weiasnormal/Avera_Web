"use client";

import { ArrowRight, Check, Lock, PencilLine } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/feedback/states";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Fact, Panel } from "@/components/ui/panel";
import { formatDate, formatDateTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useExaminationsStore } from "@/stores/examinations";
import type { Examination } from "@/types/examination";

import { currentAiResult } from "./ai-basis";
import { ReportActions, reportWarnings } from "./export-step";

/** The last action of an examination, in the place where Next sits on the other steps. */
export function FinishExaminationButton({ examination }: { examination: Examination }) {
  const [confirming, setConfirming] = useState(false);
  const hasConclusion = examination.conclusion.trim().length > 0;
  const warnings = reportWarnings(examination);

  const finish = async () => {
    const store = useExaminationsStore.getState();
    store.update({ finishedAt: new Date().toISOString() });
    await store.flush();
    setConfirming(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="flex items-center gap-3">
      {hasConclusion ? null : (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2" role="status">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Write your conclusion to finish.
        </p>
      )}
      <Button disabled={!hasConclusion} onClick={() => setConfirming(true)}>
        Finish examination
        <Check className="size-4" aria-hidden />
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={finish}
        title="Finish this examination?"
        description="Editing closes, so the report can't change by accident. You can still download it, and reopen the examination if you need to."
        confirmLabel="Finish examination"
        cancelLabel="Keep working"
      >
        {warnings.length ? (
          <Alert tone="caution" className="mb-1" title="You may want to check these first">
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

/** Where every examination ends: it's done, here's the report, and here's what's next. */
export function FinishedExamination({ examination }: { examination: Examination }) {
  const practice = examination.isPractice === true;
  const includesAi = examination.includeAiResult && currentAiResult(examination) !== null;
  const reopen = () => useExaminationsStore.getState().update({ finishedAt: null, lastStep: "conclusion" });

  return (
    <div className="mx-auto max-w-2xl animate-rise-in">
      <Panel bodyClassName="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand text-white">
            <Check className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-[20px] font-bold tracking-[-0.01em] text-ink">{practice ? "Practice complete" : "Examination finished"}</h2>
          <p className="mt-1.5 max-w-[52ch] text-[14px] text-ink-2">
            {practice
              ? "That's the whole process, from signatures to a report. You're ready to run a real examination."
              : "Download your report to print, sign or file it. This examination stays in your list on this device."}
          </p>
        </div>

        {practice ? null : (
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
            <Fact label="Case number" value={examination.caseNumber || "—"} />
            <Fact label="Signatures" value={<span className="tabular">{examination.images.length}</span>} />
            <Fact label="AI result in report" value={includesAi ? "Yes" : "No"} />
            <Fact label="Finished" value={<span title={formatDateTime(examination.finishedAt)}>{formatDate(examination.finishedAt)}</span>} />
          </dl>
        )}

        <div className="mt-6 flex justify-center">
          <ReportActions examination={examination} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-5">
          {practice ? (
            <ButtonLink href={routes.examiner.examinations} icon={<ArrowRight className="size-4" aria-hidden />}>
              Start a real examination
            </ButtonLink>
          ) : (
            <>
              <ButtonLink variant="secondary" href={routes.examiner.examinations}>
                Back to examinations
              </ButtonLink>
              <Button variant="ghost" icon={<PencilLine className="size-4" aria-hidden />} onClick={reopen}>
                Reopen to edit
              </Button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
