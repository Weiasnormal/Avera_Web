"use client";

import { ChevronRight, FilePlus2, FolderOpen, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, EmptyState, LoadError } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { useCases } from "@/hooks/use-cases";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { downloadCaseSignatures } from "@/services/cases";
import { useExaminationsStore } from "@/stores/examinations";
import type { CaseSummary } from "@/types/case";

function asFile(blob: Blob, name: string) {
  return new File([blob], name, { type: blob.type });
}

// Lists code, subject and date only. Status and verdict stay out of this list so
// the AI result doesn't reach the examiner before they form an opinion.
function CasePicker({ busy, onPick }: { busy: string | null; onPick: (item: CaseSummary) => void }) {
  const { cases, error, reload, isInitialLoading } = useCases();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return cases
      .filter((item) => item.workflowStatus !== "Processing")
      .filter((item) => !term || `${item.caseCode} ${item.subjectName}`.toLowerCase().includes(term));
  }, [cases, query]);

  if (error && cases.length === 0) return <LoadError message="We couldn't load your cases." onRetry={() => void reload()} />;

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Search cases</span>
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by case number or subject"
          className="h-10 w-full rounded-md border border-line-strong bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-ink-4 focus:border-brand focus:shadow-[0_0_0_3px_rgb(30_111_217/0.14)]"
        />
      </label>
      <div className="h-72 overflow-y-auto rounded-md border border-line">
        {isInitialLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : matches.length === 0 ? (
          <EmptyState compact title={query ? "No matching cases" : "No cases to examine yet"} description={query ? "Try a different search." : "Finished analyses appear here."} />
        ) : (
          <ul className="divide-y divide-line">
            {matches.map((item) => (
              <li key={item.caseId}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => onPick(item)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-canvas disabled:cursor-wait"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{item.subjectName || "Unnamed subject"}</span>
                    <span className="block truncate text-[12.5px] text-ink-3 tabular">
                      {item.caseCode}, {formatDate(item.createdAt)}
                    </span>
                  </span>
                  {busy === item.caseId ? <Spinner className="size-4" /> : <ChevronRight className="size-4 text-ink-4" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function NewExaminationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "case">("choose");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode("choose");
    setError(null);
    onClose();
  };

  // Next keeps the list page alive while hidden, so leave this dialog closed and idle.
  const openExamination = (id: string) => {
    setBusy(null);
    close();
    router.push(routes.examiner.examination(id));
  };

  const startBlank = async () => {
    setBusy("blank");
    setError(null);
    try {
      const examination = await useExaminationsStore.getState().create();
      openExamination(examination.id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the examination.");
      setBusy(null);
    }
  };

  // Downloads first, so a failed download doesn't leave a half-filled examination.
  const startFromCase = async (item: CaseSummary) => {
    setBusy(item.caseId);
    setError(null);
    try {
      const { references, suspected } = await downloadCaseSignatures(item.caseId);
      const store = useExaminationsStore.getState();
      const examination = await store.create({
        caseId: item.caseId,
        caseNumber: item.caseCode,
        caseName: item.subjectName ? `Disputed signature of "${item.subjectName}"` : "",
      });
      const failures = await store.addImages([
        { file: asFile(suspected, `${item.caseCode}-questioned.png`), role: "questioned" },
        ...references.map((blob, index) => ({ file: asFile(blob, `${item.caseCode}-reference-${index + 1}.png`), role: "standard" as const })),
      ]);
      if (failures.length) throw new Error(failures.join(" "));
      await store.flush();
      openExamination(examination.id);
    } catch {
      setError("We couldn't get this case's signatures. Check your connection and try again, or start blank.");
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={busy === null}
      size="md"
      title={mode === "case" ? "Choose a case" : "New examination"}
      description={mode === "case" ? "Its questioned signature and 4 references are copied into the examination." : "You can add up to 9 signature images."}
      footer={
        mode === "case" ? (
          <Button variant="secondary" disabled={busy !== null} onClick={() => setMode("choose")}>
            Back
          </Button>
        ) : undefined
      }
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      {mode === "case" ? (
        <CasePicker busy={busy} onPick={(item) => void startFromCase(item)} />
      ) : (
        <div className="flex flex-col gap-2.5 pb-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setMode("case")}
            className="pressable flex items-center gap-3 rounded-md border border-line-strong p-3.5 text-left hover:border-ink-4 hover:bg-canvas disabled:cursor-wait"
          >
            <FolderOpen className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">From an Avera case</span>
              <span className="block text-[13px] text-ink-3">Reuse signatures you already uploaded.</span>
            </span>
            <ChevronRight className="size-4 text-ink-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void startBlank()}
            className="pressable flex items-center gap-3 rounded-md border border-line-strong p-3.5 text-left hover:border-ink-4 hover:bg-canvas disabled:cursor-wait"
          >
            <FilePlus2 className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">Start blank</span>
              <span className="block text-[13px] text-ink-3">Upload the signatures yourself.</span>
            </span>
            {busy === "blank" ? <Spinner className="size-4" /> : <ChevronRight className="size-4 text-ink-4" aria-hidden />}
          </button>
        </div>
      )}
    </Dialog>
  );
}
