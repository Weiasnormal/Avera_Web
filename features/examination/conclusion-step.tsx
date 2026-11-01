"use client";

import { Bot, Eye, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Fact, Panel } from "@/components/ui/panel";
import { formatDateTime, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { resolveVerdict, titleCase } from "@/features/results/verdict";
import { fetchCaseDetail } from "@/services/cases";
import { useExaminationsStore } from "@/stores/examinations";
import { useSessionStore } from "@/stores/session";
import type { Examination } from "@/types/examination";

import { currentAiResult, hasAiBasisChanged, standardsOutsideAiBasis } from "./ai-basis";
import { RunAiDialog } from "./run-ai-dialog";

function exhibitRange(examination: Examination) {
  const questioned = examination.images.find((image) => image.role === "questioned")?.label ?? "Q1";
  const standards = examination.images.filter((image) => image.role === "standard");
  const first = standards[0]?.label ?? "S1";
  const last = standards[standards.length - 1]?.label ?? first;
  return `${questioned} and ${first === last ? first : `${first} to ${last}`}`;
}

// Starting points only, offered once the field is empty. Nothing is pre-selected.
function conclusionWordings(examination: Examination) {
  const exhibits = exhibitRange(examination);
  return [
    { label: "Not the same writer", text: `The signatures marked exhibits ${exhibits} were NOT written by one and the same person.` },
    { label: "Same writer", text: `The signatures marked exhibits ${exhibits} were written by one and the same person.` },
    { label: "Inconclusive", text: `No conclusion can be reached on whether the signatures marked exhibits ${exhibits} were written by one and the same person.` },
  ];
}

function AiPanel({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const hasConclusion = examination.conclusion.trim().length > 0;
  const changed = hasAiBasisChanged(examination);
  const result = currentAiResult(examination);
  const conclusionChanged = result ? result.conclusionAtReveal.trim() !== examination.conclusion.trim() : false;
  const unacceptedExtras = result ? standardsOutsideAiBasis(examination).filter((image) => !result.acceptedExtraImageIds?.includes(image.id)) : [];

  // The examiner's call: the result stands as it is, on the record of what it compared.
  const keepResult = () => {
    if (!result) return;
    update({
      aiResult: {
        ...result,
        conclusionAtReveal: examination.conclusion,
        acceptedExtraImageIds: standardsOutsideAiBasis(examination).map((image) => image.id),
      },
    });
  };

  if (examination.isPractice) {
    return (
      <Panel title="AI comparison">
        <p className="text-[13.5px] text-ink-2">In a real examination, you can compare your opinion with Avera&apos;s model here, once your conclusion is written. It isn&apos;t available in practice.</p>
      </Panel>
    );
  }

  const reveal = async () => {
    if (!examination.caseId) return;
    setRevealing(true);
    setError(null);
    try {
      const tenantId = useSessionStore.getState().claims?.tenantId;
      const detail = await fetchCaseDetail(examination.caseId, tenantId);
      const verdict = resolveVerdict(detail);
      if (!detail.mlResponse || !verdict.model) {
        setError("This case's AI analysis isn't finished yet. Try again in a moment.");
        return;
      }
      update({
        aiResult: {
          verdict: titleCase(verdict.model) as "Genuine" | "Suspected",
          confidence: verdict.modelConfidence,
          distance: detail.mlResponse.distance,
          threshold: detail.mlResponse.threshold,
          revealedAt: new Date().toISOString(),
          conclusionAtReveal: examination.conclusion,
        },
      });
    } catch {
      setError("We couldn't get the AI result. Check your connection and try again.");
    } finally {
      setRevealing(false);
    }
  };

  return (
    <Panel title="AI comparison" description="Optional. Compare your opinion with Avera's model after you've formed it.">
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {result ? (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Fact label="Model result" value={result.verdict} />
            <Fact label="Confidence score" value={<span className="tabular">{formatPercent(result.confidence)}</span>} />
            <Fact label="Distance" value={<span className="tabular">{result.distance.toFixed(4)}</span>} />
            <Fact label="Threshold" value={<span className="tabular">{result.threshold.toFixed(4)}</span>} />
          </dl>
          <p className="text-[13px] text-ink-3">
            Seen {formatDateTime(result.revealedAt)}. The model supports your judgment and doesn&apos;t replace it. The confidence is a score, not a statistical probability.
          </p>
          {conclusionChanged || unacceptedExtras.length ? (
            <Alert tone="caution" title="Keep this result or run a new analysis?">
              <ul>
                {conclusionChanged ? <li>You edited your conclusion after seeing this result.</li> : null}
                {unacceptedExtras.length ? (
                  <li>
                    The analysis didn&apos;t compare {unacceptedExtras.map((image) => image.label).join(", ")}, added afterwards.
                  </li>
                ) : null}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={keepResult}>
                  Keep this result
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setRunning(true)}>
                  Run new analysis
                </Button>
              </div>
            </Alert>
          ) : null}
          <label className="flex items-center gap-2.5 text-[13.5px] font-medium text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={examination.includeAiResult}
              onChange={(event) => update({ includeAiResult: event.target.checked })}
            />
            Include this AI result in the report
          </label>
          <div className="flex flex-wrap items-center gap-4">
            {examination.caseId ? (
              <Link href={routes.examiner.caseResult(examination.caseId)} className="w-fit text-[13px] font-semibold text-brand-strong underline">
                Open the full AI result
              </Link>
            ) : null}
            {conclusionChanged || unacceptedExtras.length ? null : (
              <button type="button" onClick={() => setRunning(true)} className="text-[13px] font-semibold text-brand-strong underline">
                Run new analysis
              </button>
            )}
          </div>
        </div>
      ) : !hasConclusion ? (
        <p className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <Lock className="size-4 shrink-0 text-ink-3" aria-hidden />
          Write your conclusion first. This keeps the AI from influencing your opinion.
        </p>
      ) : changed ? (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="caution" title="Your signatures changed after the AI analysis" className="w-full">
            The linked case compared different signatures or crops, so its result doesn&apos;t apply here and stays out of the report. Run a separate analysis to get a result for these signatures. The original case isn&apos;t changed.
          </Alert>
          <Button variant="secondary" icon={<Bot className="size-4" aria-hidden />} onClick={() => setRunning(true)}>
            Run separate analysis
          </Button>
        </div>
      ) : examination.caseId ? (
        <Button variant="secondary" loading={revealing} icon={<Eye className="size-4" aria-hidden />} onClick={() => void reveal()}>
          Reveal AI result
        </Button>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13.5px] text-ink-2">This examination isn&apos;t linked to an Avera case, so it has no AI result yet.</p>
          <Button variant="secondary" icon={<Bot className="size-4" aria-hidden />} onClick={() => setRunning(true)}>
            Run AI analysis
          </Button>
        </div>
      )}
      {running ? <RunAiDialog examination={examination} onClose={() => setRunning(false)} /> : null}
    </Panel>
  );
}

export function ConclusionPanel({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  const isEmpty = examination.conclusion.trim().length === 0;
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Your conclusion" className="scroll-mt-20">
        <div data-tour="conclusion">
        <TextAreaField
          label="Conclusion"
          value={examination.conclusion}
          onChange={(event) => update({ conclusion: event.target.value })}
        />
        {isEmpty ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink-3">Start from wording:</span>
            {conclusionWordings(examination).map((wording) => (
              <Button key={wording.label} variant="secondary" size="sm" onClick={() => update({ conclusion: wording.text })}>
                {wording.label}
              </Button>
            ))}
          </div>
        ) : null}
        </div>
      </Panel>
      <AiPanel examination={examination} />
    </div>
  );
}
