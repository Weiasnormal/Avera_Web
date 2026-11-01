"use client";

import { CircleHelp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, EmptyState, LoadError } from "@/components/feedback/states";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/spinner";
import { formatRelativeTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useExaminationsStore } from "@/stores/examinations";
import { toast } from "@/stores/toast";
import type { Examination } from "@/types/examination";

import { EXAMINATION_STEPS, examinationTitle, startedStepCount } from "./model";
import { NewExaminationDialog } from "./new-examination-dialog";
import { ExaminationIntro, useExaminationIntro } from "./tutorial";

export function ExaminationList() {
  const items = useExaminationsStore((state) => state.items);
  const status = useExaminationsStore((state) => state.listStatus);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Examination | null>(null);
  const [deleting, setDeleting] = useState(false);

  const intro = useExaminationIntro();

  useEffect(() => {
    void useExaminationsStore.getState().loadList();
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await useExaminationsStore.getState().remove(pendingDelete.id);
      toast.success("Examination deleted.");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the examination.");
    } finally {
      setDeleting(false);
    }
  };

  const newButton = (
    <>
      <Button variant="ghost" icon={<CircleHelp className="size-4" aria-hidden />} onClick={intro.show}>
        How it works
      </Button>
      <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
        New examination
      </Button>
    </>
  );

  return (
    <>
      <PageHeader title="Examination" description="Compare signatures by hand and prepare your signed report." actions={newButton} />

      <Alert tone="caution" className="mb-5" title="Saved on this device only">
        Your work stays in this browser and won&apos;t appear on other devices. Clearing browser data deletes it, and anyone using this
        browser profile could reach it.
      </Alert>

      {status === "error" ? (
        <Panel>
          <LoadError message="We couldn't open your saved examinations." onRetry={() => void useExaminationsStore.getState().loadList()} />
        </Panel>
      ) : status === "idle" || status === "loading" ? (
        <Panel bodyClassName="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Panel>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState
            title="No examinations yet"
            description="Start one to crop signatures, mark stroke differences, fill your findings and download the report."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden" bodyClassName="p-0!">
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b border-line bg-canvas text-[12px] text-ink-3">
              <tr>
                <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold">Case</th>
                <th scope="col" className="hidden px-3 py-2.5 font-semibold sm:table-cell">Images</th>
                <th scope="col" className="hidden px-3 py-2.5 font-semibold sm:table-cell">Progress</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Updated</th>
                <th scope="col" className="py-2.5 pr-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => (
                <tr key={item.id} className="relative transition-colors hover:bg-canvas">
                  <td className="max-w-0 min-w-40 py-3.5 pr-3 pl-5 sm:w-1/2">
                    <Link
                      href={routes.examiner.examination(item.id)}
                      className="block truncate font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand"
                    >
                      {examinationTitle(item)}
                    </Link>
                    {item.caseNumber ? <p className="truncate text-[12.5px] text-ink-3 tabular">{item.caseNumber}</p> : null}
                  </td>
                  <td className="hidden px-3 py-3.5 text-ink-2 tabular sm:table-cell">{item.images.length}</td>
                  <td className="hidden px-3 py-3.5 text-ink-2 tabular sm:table-cell">
                    {/* Brand, not green: a finished examination says nothing about the verdict. */}
                    {item.finishedAt ? <Badge tone="brand">Finished</Badge> : `${startedStepCount(item)} of ${EXAMINATION_STEPS.length} steps`}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-ink-2">{formatRelativeTime(item.updatedAt)}</td>
                  <td className="relative w-12 py-2 pr-3 text-right">
                    <IconButton size="sm" label={`Delete ${examinationTitle(item)}`} onClick={() => setPendingDelete(item)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <ExaminationIntro open={intro.open} onClose={intro.close} />
      <NewExaminationDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete this examination?"
        description={`"${pendingDelete ? examinationTitle(pendingDelete) : ""}" and its images will be removed from this device. This can't be undone.`}
        confirmLabel="Delete examination"
      />
    </>
  );
}
