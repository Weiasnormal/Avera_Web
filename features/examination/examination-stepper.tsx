import { Check } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import type { Examination, ExaminationStepId } from "@/types/examination";

import { EXAMINATION_STEPS, isStepStarted } from "./model";

/** Every step is a plain link: examiners can move between them in any order. */
export function ExaminationStepper({
  examination,
  active,
  hrefFor,
}: {
  examination: Examination;
  active: ExaminationStepId;
  hrefFor: (step: ExaminationStepId) => string;
}) {
  return (
    <nav aria-label="Examination steps">
      <ol className="grid grid-cols-7">
        {EXAMINATION_STEPS.map((step, index) => {
          const isActive = step.id === active;
          const started = isStepStarted(examination, step.id);
          return (
            <li key={step.id} className="relative min-w-0">
              {index > 0 ? <span aria-hidden className="absolute top-[15px] right-1/2 left-[-50%] h-px bg-line-strong" /> : null}
              <Link
                href={hrefFor(step.id)}
                scroll={false}
                aria-current={isActive ? "step" : undefined}
                className="group relative z-10 flex flex-col items-center gap-1.5 rounded-md py-0.5"
              >
                <span
                  className={cn(
                    "pressable flex size-[30px] items-center justify-center rounded-full border text-[13px] font-semibold tabular group-active:scale-95",
                    isActive
                      ? "border-brand bg-brand text-white"
                      : started
                        ? "border-brand-line bg-brand-soft text-brand-strong"
                        : "border-line-strong bg-surface text-ink-3 group-hover:border-ink-4 group-hover:text-ink",
                  )}
                >
                  {started && !isActive ? <Check className="size-4" aria-hidden /> : index + 1}
                </span>
                <span className={cn("truncate text-[12.5px] font-medium", isActive ? "font-semibold text-ink" : "text-ink-3 group-hover:text-ink")}>
                  {step.label}
                  {started ? <span className="sr-only"> (started)</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
