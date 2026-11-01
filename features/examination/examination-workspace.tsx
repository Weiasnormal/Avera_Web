"use client";

import { ArrowLeft, ArrowRight, CircleAlert, Check, HardDrive, RotateCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { Alert, EmptyState, LoadError } from "@/components/feedback/states";
import { Button, buttonClasses, ButtonLink } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Fact, Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/spinner";
import { formatDate, formatDateTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useExaminationsStore } from "@/stores/examinations";
import { EXAMINATION_STEP_IDS, type Examination, type ExaminationStepId } from "@/types/examination";

import { ExaminationStepper } from "./examination-stepper";
import { ImagesPanel } from "./images-step";
import { CropPanel } from "./crop-step";
import { EXAMINATION_STEPS, examinationTitle, missingForExamination, startedStepCount } from "./model";

function isStepId(value: string | null): value is ExaminationStepId {
  return EXAMINATION_STEP_IDS.includes(value as ExaminationStepId);
}

function SaveIndicator() {
  const status = useExaminationsStore((state) => state.saveStatus);
  const updatedAt = useExaminationsStore((state) => state.current?.updatedAt);

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => void useExaminationsStore.getState().flush()}
        className="pressable inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-[12.5px] font-semibold text-danger hover:bg-danger-soft"
      >
        <RotateCw className="size-3.5" aria-hidden />
        Not saved. Try again
      </button>
    );
  }
  if (status === "conflict") {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 text-[12.5px] font-semibold text-danger">
        <CircleAlert className="size-3.5" aria-hidden />
        Not saved
      </span>
    );
  }
  const saving = status === "pending" || status === "saving";
  return (
    <span className="inline-flex h-8 items-center gap-1.5 text-[12.5px] text-ink-3">
      {saving ? <HardDrive className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-genuine" aria-hidden />}
      {saving ? "Saving to this device…" : `Saved on this device only, ${formatDateTime(updatedAt)}`}
    </span>
  );
}

function CaseDetails({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  return (
    <Panel title="Case details">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Name of the case"
          value={examination.caseName}
          maxLength={160}
          placeholder="Disputed signature of…"
          onChange={(event) => update({ caseName: event.target.value })}
        />
        <TextField
          label="Case number"
          value={examination.caseNumber}
          maxLength={60}
          onChange={(event) => update({ caseNumber: event.target.value })}
        />
      </div>
    </Panel>
  );
}

// Filled in by the following build steps; see docs/examination/AUDIT.md.
function UpcomingStep({ title }: { title: string }) {
  return (
    <Panel>
      <EmptyState compact title={`${title} isn't available yet`} description="You can move through the other steps. Your work is kept." />
    </Panel>
  );
}

function ActiveStep({ step, examination }: { step: ExaminationStepId; examination: Examination }) {
  if (step === "images") {
    return (
      <div className="flex flex-col gap-5">
        <CaseDetails examination={examination} />
        <ImagesPanel examination={examination} />
      </div>
    );
  }
  if (step === "crop") return <CropPanel examination={examination} />;
  return <UpcomingStep title={EXAMINATION_STEPS.find((item) => item.id === step)!.title} />;
}

/** Marking needs room: phones get a summary instead of a cramped editor. */
function PhoneSummary({ examination }: { examination: Examination }) {
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <Alert tone="info" title="Editing needs a larger screen">
        Open this examination on a tablet or computer to crop, mark and fill findings. It&apos;s saved on the device where you started it.
      </Alert>
      <Panel>
        <dl className="grid grid-cols-2 gap-4">
          <Fact label="Case number" value={examination.caseNumber || "—"} />
          <Fact label="Images" value={<span className="tabular">{examination.images.length}</span>} />
          <Fact label="Steps started" value={<span className="tabular">{startedStepCount(examination)} of {EXAMINATION_STEPS.length}</span>} />
          <Fact label="Updated" value={formatDate(examination.updatedAt)} />
        </dl>
      </Panel>
    </div>
  );
}

export function ExaminationWorkspace({ examinationId }: { examinationId: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = useExaminationsStore((state) => state.current);
  const status = useExaminationsStore((state) => state.currentStatus);
  const saveStatus = useExaminationsStore((state) => state.saveStatus);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef<ExaminationStepId | null>(null);

  const examination = current?.id === examinationId ? current : null;
  const requested = params.get("step");
  const locked = examination ? missingForExamination(examination) : null;
  const wanted: ExaminationStepId = isStepId(requested) ? requested : (examination?.lastStep ?? "images");
  // A saved position or shared link can't skip the required signatures.
  const step: ExaminationStepId = locked ? "images" : wanted;
  const stepIndex = EXAMINATION_STEP_IDS.indexOf(step);
  const stepInfo = EXAMINATION_STEPS[stepIndex];
  const hrefFor = (target: ExaminationStepId) => `${pathname}?step=${target}`;

  useEffect(() => {
    void useExaminationsStore.getState().open(examinationId);
  }, [examinationId]);

  // Remember where the examiner left off.
  const hasExamination = examination !== null;
  useEffect(() => {
    if (!hasExamination) return;
    const store = useExaminationsStore.getState();
    if (store.current?.lastStep !== step) store.update({ lastStep: step });
  }, [hasExamination, step]);

  // Moving between steps replaces the content, so bring screen readers and the
  // keyboard along with it. The first render keeps the browser's own focus.
  useEffect(() => {
    if (previousStep.current && previousStep.current !== step) {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
    previousStep.current = step;
  }, [step]);

  // Don't lose the last edits when leaving the page or switching away.
  useEffect(() => {
    const flush = () => void useExaminationsStore.getState().flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const backLink = (
    <Link
      href={routes.examiner.examinations}
      className="inline-flex items-center gap-1.5 rounded-sm text-[13px] font-semibold text-ink-3 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All examinations
    </Link>
  );

  if (status === "missing") {
    return (
      <Panel>
        <EmptyState
          title="Examination not found"
          description="It may have been deleted, or it was saved on another device or browser."
          action={<ButtonLink href={routes.examiner.examinations}>Back to examinations</ButtonLink>}
        />
      </Panel>
    );
  }
  if (status === "error") {
    return (
      <Panel>
        <LoadError message="We couldn't open this examination." onRetry={() => void useExaminationsStore.getState().open(examinationId)} />
      </Panel>
    );
  }
  if (!examination) {
    return (
      <div aria-busy className="flex flex-col gap-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const previous = EXAMINATION_STEPS[stepIndex - 1];
  const next = EXAMINATION_STEPS[stepIndex + 1];

  return (
    <>
      <div className="mb-5">
        <div className="mb-3">{backLink}</div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <h1 className="min-w-0 truncate text-[24px] leading-tight font-bold tracking-[-0.015em] text-ink">{examinationTitle(examination)}</h1>
          <div className="hidden md:block" aria-live="polite">
            <SaveIndicator />
          </div>
        </div>
      </div>

      <PhoneSummary examination={examination} />

      <div className="hidden md:block">
        {saveStatus === "conflict" ? (
          <Alert
            className="mb-5"
            title="This examination was changed in another tab"
            action={
              <button type="button" onClick={() => window.location.reload()} className={buttonClasses("secondary", "sm")}>
                Reload
              </button>
            }
          >
            Your latest edits here weren&apos;t saved. Reload to continue from the newest version.
          </Alert>
        ) : null}

        <ExaminationStepper examination={examination} active={step} locked={locked} hrefFor={hrefFor} />

        <div key={step} className="mt-7 animate-fade-in">
          <div className="mb-5">
            <h2 ref={headingRef} tabIndex={-1} className="text-[18px] font-semibold text-ink outline-none">
              {stepInfo.title}
            </h2>
            <p className="mt-1 text-[14px] text-ink-3">{stepInfo.description}</p>
          </div>
          <ActiveStep step={step} examination={examination} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {previous ? (
            <ButtonLink variant="secondary" href={hrefFor(previous.id)} scroll={false} icon={<ArrowLeft className="size-4" aria-hidden />}>
              {previous.label}
            </ButtonLink>
          ) : (
            <span />
          )}
          {locked ? (
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-medium text-ink-2" role="status">
                {locked}
              </p>
              <Button disabled>
                Next: {next.label}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : next ? (
            <ButtonLink href={hrefFor(next.id)} scroll={false}>
              Next: {next.label}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </>
  );
}
