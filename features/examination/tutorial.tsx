"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { readPreference, writePreference } from "@/lib/preferences";
import { routes } from "@/lib/routes";
import { examinationRepository } from "@/services/examinations";
import { useExaminationsStore } from "@/stores/examinations";
import { useSessionStore } from "@/stores/session";
import { toast } from "@/stores/toast";
import type { ExaminationStepId } from "@/types/examination";

import { EXAMINATION_STEPS, signatureImageId } from "./model";
import { PRACTICE_REPORT_DETAILS, practiceImages, practiceSignature } from "./practice";

interface Tip {
  /** Matches a data-tour attribute on the page. */
  target: string;
  title: string;
  body: string;
}

const STEP_TIPS: Record<ExaminationStepId, Tip[]> = {
  images: [
    { target: "steps", title: "Seven steps, in any order", body: "Move between steps whenever you like. Your work saves on its own. The later steps open once the questioned signature and 4 standards are in." },
    { target: "images", title: "Add your signatures", body: "Add 1 questioned signature and 4 to 8 standards. You can reorder them or change which one is questioned." },
  ],
  crop: [
    { target: "strip", title: "All your signatures", body: "Select a signature to work on it. A check shows which ones you've cropped." },
    { target: "stage", title: "Frame the signature", body: "Drag on the image to draw a frame, then adjust it by the corners. Your original is kept, so you can change a crop at any time. Zoom in with the plus button." },
  ],
  mark: [
    { target: "palette", title: "Numbered markers", body: "Add a marker for each stroke feature you want to compare. Marker 3 means the same feature on every signature." },
    { target: "stage", title: "Place the arrows", body: "Drag a number onto the signature, or select one and tap the stroke. Then drag the arrow tip or the number to adjust it." },
    { target: "checklist", title: "See what's missing", body: "This shows which markers are on which signature. Select a dot to go straight there." },
  ],
  chart: [
    { target: "panel", title: "Your comparison chart", body: "Each marker becomes a row of close-ups, one per signature. Use + and − to change a whole row, or select a close-up to adjust just that one." },
  ],
  general: [
    { target: "panel", title: "General findings", body: "Describe the standards and the questioned signature as a whole. Every heading can be renamed, and rows and columns can be moved, added or removed." },
  ],
  specific: [
    { target: "panel", title: "Specific findings", body: "Rows follow your markers and columns follow your signatures. The copy button in a row repeats a standard's text across all standards. Remarks start blank." },
  ],
  conclusion: [
    { target: "conclusion", title: "Your opinion comes first", body: "Write your conclusion before anything else on this step. The AI result stays locked until you do, so it can't influence your opinion." },
    { target: "report", title: "Download your report", body: "Add your letterhead and signature, preview the pages, then download the PDF." },
  ],
};

const OFFSET = 8;
const CARD_WIDTH = 340;

/** Dims the page around one element at a time, with its tip beside it. */
export function SpotlightTour({ tips, onClose }: { tips: Tip[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const tip = tips[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Enter should move forward, so focus starts on the main button rather than Skip.
  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  const measure = useCallback(() => {
    const element = document.querySelector(`[data-tour="${tip.target}"]`);
    setRect(element && (element as HTMLElement).offsetParent !== null ? element.getBoundingClientRect() : null);
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [tip.target]);

  useLayoutEffect(() => {
    document.querySelector(`[data-tour="${tip.target}"]`)?.scrollIntoView({ block: "center" });
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measure, tip.target]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const below = rect ? rect.bottom + OFFSET + 12 : 0;
  const above = rect ? rect.top - OFFSET - 12 - cardHeight : 0;
  const top = !rect
    ? (viewportHeight - cardHeight) / 2
    : below + cardHeight < viewportHeight
      ? below
      : above > 8
        ? above
        : viewportHeight - cardHeight - 16;
  const left = Math.max(16, Math.min(viewportWidth - CARD_WIDTH - 16, rect ? rect.left : (viewportWidth - CARD_WIDTH) / 2));
  const isLast = index === tips.length - 1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tour-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-transparent"
    >
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg transition-[left,top,width,height] duration-200 ease-out"
          style={{
            left: rect.left - OFFSET,
            top: rect.top - OFFSET,
            width: rect.width + OFFSET * 2,
            height: rect.height + OFFSET * 2,
            boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.5)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-ink/50" />
      )}
      <div ref={cardRef} className="absolute rounded-lg bg-surface p-4 shadow-pop animate-fade-in" style={{ top, left, width: CARD_WIDTH, maxWidth: "calc(100vw - 32px)" }} key={index}>
        <p id="tour-title" className="text-[15px] font-semibold text-ink">
          {tip.title}
        </p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{tip.body}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="mr-auto text-[12.5px] text-ink-3 tabular">
            {index + 1} of {tips.length}
          </span>
          {isLast ? null : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip
            </Button>
          )}
          {index > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          <Button ref={nextRef} size="sm" onClick={() => (isLast ? onClose() : setIndex(index + 1))}>
            {isLast ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function seenKey(practice = false) {
  return `examination-tips${practice ? "-practice" : ""}:${useSessionStore.getState().claims?.userId ?? ""}`;
}

/**
 * Each step's tips open once by themselves, and again for every new practice run.
 * Tips seen in practice aren't repeated in real examinations. Show tips replays them.
 */
export function useStepTips(step: ExaminationStepId, ready: boolean, practice: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || window.innerWidth < 768) return;
    const seen = readPreference<string[]>(seenKey(practice), []);
    if (seen.includes(step)) return;
    const timer = setTimeout(() => {
      writePreference(seenKey(practice), [...seen, step]);
      const seenReal = readPreference<string[]>(seenKey(), []);
      if (!seenReal.includes(step)) writePreference(seenKey(), [...seenReal, step]);
      setOpen(true);
    }, 450);
    return () => {
      clearTimeout(timer);
      setOpen(false);
    };
  }, [practice, ready, step]);

  return { tips: STEP_TIPS[step], open, show: () => setOpen(true), close: () => setOpen(false) };
}

function introKey() {
  return `examination-intro:${useSessionStore.getState().claims?.userId ?? ""}`;
}

export function useExaminationIntro() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (readPreference(introKey(), false)) return;
    const timer = setTimeout(() => setOpen(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      writePreference(introKey(), true);
      setOpen(false);
    },
  };
}

/** What the page is for, the steps, and a safe place to try them. */
export function ExaminationIntro({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const startPractice = async () => {
    setStarting(true);
    try {
      const store = useExaminationsStore.getState();
      const images = await practiceImages();
      const examination = await store.create({ isPractice: true, caseName: "Practice examination", caseNumber: "PRACTICE", ...PRACTICE_REPORT_DETAILS });
      const userId = useSessionStore.getState().claims?.userId ?? "";
      await examinationRepository.putImage(userId, examination.id, signatureImageId(userId, examination), await practiceSignature());
      await store.addImages(images);
      await store.flush();
      // A new run starts its tips over.
      writePreference(seenKey(true), []);
      setStarting(false);
      onClose();
      router.push(routes.examiner.examination(examination.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The practice examination couldn't start.");
      setStarting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!starting}
      size="md"
      title="Examine signatures digitally"
      description="Work the way you do on paper, one step at a time, and download a signed report."
      footer={
        <>
          <Button variant="secondary" disabled={starting} onClick={onClose}>
            Start using it
          </Button>
          <Button loading={starting} onClick={() => void startPractice()}>
            Try a practice examination
          </Button>
        </>
      }
    >
      <ol className="flex flex-col gap-2 pb-1">
        {EXAMINATION_STEPS.map((step, index) => (
          <li key={step.id} className="flex gap-3 text-[13.5px]">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12.5px] font-semibold text-brand-strong tabular">{index + 1}</span>
            <span className="min-w-0">
              <span className="font-semibold text-ink">{step.title}.</span> <span className="text-ink-2">{step.description}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 pb-1 text-[13px] text-ink-3">Practice uses made-up signatures and is removed when you return to this list.</p>
    </Dialog>
  );
}
