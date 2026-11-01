"use client";

import { useEffect, useMemo } from "react";

import { Panel } from "@/components/ui/panel";
import { useExaminationsStore } from "@/stores/examinations";
import type { Examination, FindingsTable } from "@/types/examination";

import { syncSpecificFindings } from "./findings";
import { FindingsEditor } from "./findings-editor";

export function GeneralFindingsPanel({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  const table: FindingsTable = { ...examination.generalFindings, rowHeader: examination.generalFindings.rowHeader ?? "Description" };
  return (
    <Panel>
      <FindingsEditor table={table} onChange={(generalFindings) => update({ generalFindings })} />
    </Panel>
  );
}

export function SpecificFindingsPanel({ examination }: { examination: Examination }) {
  const update = useExaminationsStore((state) => state.update);
  const { images, markers, specificFindings } = examination;
  const table = useMemo(() => syncSpecificFindings({ images, markers, specificFindings }), [images, markers, specificFindings]);

  // New signatures and markers become columns and rows without any action.
  useEffect(() => {
    if (JSON.stringify(table) !== JSON.stringify(specificFindings)) update({ specificFindings: table });
    // Only structural changes come from here; ids stay stable once saved.
  }, [table, specificFindings, update]);

  return (
    <Panel>
      <p className="mb-3 text-[13px] text-ink-3">
        Rows follow your markers and columns follow your signatures. The copy button in a row repeats a standard&apos;s text across all standards.
      </p>
      <FindingsEditor
        table={table}
        images={images}
        onChange={(specific) => update({ specificFindings: specific })}
        emptyHint="Place markers in the Mark step, or add a row yourself."
      />
    </Panel>
  );
}
