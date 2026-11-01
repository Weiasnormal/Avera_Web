"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CopyCheck, Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";

import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ExaminationImage, FindingsColumn, FindingsRow, FindingsTable } from "@/types/examination";

import {
  dismissedCount,
  hasText,
  otherStandardColumns,
  REMARK_PRESETS,
  withCell,
  withColumnMoved,
  withColumnTitle,
  withDismissedRestored,
  withNewColumn,
  withNewRow,
  withoutColumn,
  withoutRow,
  withRowMoved,
  withRowTitle,
} from "./findings";

const CUSTOM_REMARK = "__custom";

const CELL_INPUT =
  "w-full resize-none rounded-sm border border-transparent px-2 py-1.5 text-[13px] leading-relaxed text-ink outline-none " +
  "placeholder:text-ink-4 hover:border-line-strong focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_rgb(30_111_217/0.14)]";

function AutoTextarea({
  value,
  onChange,
  label,
  onFocus,
  field = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  onFocus?: () => void;
  /** Answer cells get a soft fill, so they read as places to type. */
  field?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={3}
      aria-label={label}
      value={value}
      onFocus={onFocus}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      className={cn(CELL_INPUT, "block overflow-hidden", field ? "bg-canvas" : "bg-transparent")}
    />
  );
}

function RemarkCell({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [customMode, setCustomMode] = useState(false);
  const isCustom = customMode || (value !== "" && !REMARK_PRESETS.includes(value));
  return (
    <div className="flex flex-col gap-1">
      {/* Native on purpose: the table scrolls, which would clip the shared Select's menu. */}
      <select
        aria-label={label}
        value={isCustom ? CUSTOM_REMARK : value}
        onChange={(event) => {
          const next = event.target.value;
          setCustomMode(next === CUSTOM_REMARK);
          if (next !== CUSTOM_REMARK) onChange(next);
        }}
        className="h-9 w-full rounded-sm border border-line-strong bg-surface px-1.5 text-[13px] text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(30_111_217/0.14)]"
      >
        <option value="">Choose…</option>
        {REMARK_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value={CUSTOM_REMARK}>Write my own…</option>
      </select>
      {isCustom ? <AutoTextarea field value={value} onChange={onChange} label={`${label}, your wording`} /> : null}
    </div>
  );
}

/**
 * Editable report table. Every row and column can be renamed, moved or removed;
 * cells start blank so nothing suggests an opinion to the examiner.
 */
export function FindingsEditor({
  table,
  images = [],
  onChange,
  emptyHint,
}: {
  table: FindingsTable;
  images?: ExaminationImage[];
  onChange: (table: FindingsTable) => void;
  emptyHint?: string;
}) {
  const [pending, setPending] = useState<
    | { kind: "column"; column: FindingsColumn }
    | { kind: "row"; row: FindingsRow }
    | { kind: "copy"; rowId: string; columnId: string; targets: string[] }
    | null
  >(null);
  const lastFocused = useRef<Record<string, string>>({});

  const standardColumnIds = table.columns
    .filter((column) => images.some((image) => image.id === column.imageId && image.role === "standard"))
    .map((column) => column.id);
  const canCopy = standardColumnIds.length > 1;

  const copyToStandards = (row: FindingsRow) => {
    const focused = lastFocused.current[row.id];
    const sourceId = focused && hasText(row, focused) ? focused : standardColumnIds.find((id) => hasText(row, id));
    if (!sourceId) return;
    const targets = otherStandardColumns(table, images, sourceId).map((column) => column.id);
    const text = row.cells[sourceId];
    // Asking only when different wording would be replaced.
    if (targets.some((id) => hasText(row, id) && row.cells[id] !== text)) {
      setPending({ kind: "copy", rowId: row.id, columnId: sourceId, targets });
      return;
    }
    applyCopy(row.id, sourceId, targets);
  };

  const applyCopy = (rowId: string, sourceId: string, targets: string[]) => {
    const text = table.rows.find((row) => row.id === rowId)?.cells[sourceId] ?? "";
    onChange(targets.reduce((result, id) => withCell(result, rowId, id, text), table));
  };

  const removeColumn = (column: FindingsColumn) => {
    if (table.rows.some((row) => hasText(row, column.id))) setPending({ kind: "column", column });
    else onChange(withoutColumn(table, column.id));
  };

  const removeRow = (row: FindingsRow) => {
    if (hasText(row)) setPending({ kind: "row", row });
    else onChange(withoutRow(table, row.id));
  };

  const hidden = dismissedCount(table);

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-line-strong">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-canvas align-top">
              <th scope="col" className="sticky left-0 z-10 w-44 min-w-44 border-b border-line-strong bg-canvas p-1.5 text-left">
                <input
                  aria-label="First column heading"
                  value={table.rowHeader ?? ""}
                  onChange={(event) => onChange({ ...table, rowHeader: event.target.value })}
                  className={cn(CELL_INPUT, "bg-transparent font-semibold")}
                />
              </th>
              {table.columns.map((column, index) => (
                <th key={column.id} scope="col" className="min-w-48 border-b border-l border-line-strong p-1.5 text-left font-semibold">
                  <input
                    aria-label={`Column ${index + 1} heading`}
                    value={column.title}
                    onChange={(event) => onChange(withColumnTitle(table, column.id, event.target.value))}
                    className={cn(CELL_INPUT, "bg-transparent font-semibold")}
                  />
                  <span className="mt-0.5 flex items-center">
                    <IconButton size="sm" label={`Move ${column.title} left`} disabled={index === 0} onClick={() => onChange(withColumnMoved(table, column.id, -1))}>
                      <ChevronLeft className="size-4" />
                    </IconButton>
                    <IconButton size="sm" label={`Move ${column.title} right`} disabled={index === table.columns.length - 1} onClick={() => onChange(withColumnMoved(table, column.id, 1))}>
                      <ChevronRight className="size-4" />
                    </IconButton>
                    <IconButton size="sm" className="ml-auto" label={`Remove column ${column.title}`} onClick={() => removeColumn(column)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => {
              const canCopyRow = canCopy && standardColumnIds.some((id) => hasText(row, id));
              return (
                <tr key={row.id} className="align-top">
                  <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface p-1.5 text-left font-medium">
                    <AutoTextarea value={row.title} label={`Row ${index + 1} heading`} onChange={(title) => onChange(withRowTitle(table, row.id, title))} />
                    <span className="mt-0.5 flex items-center">
                      <IconButton size="sm" label={`Move ${row.title} up`} disabled={index === 0} onClick={() => onChange(withRowMoved(table, row.id, -1))}>
                        <ChevronUp className="size-4" />
                      </IconButton>
                      <IconButton size="sm" label={`Move ${row.title} down`} disabled={index === table.rows.length - 1} onClick={() => onChange(withRowMoved(table, row.id, 1))}>
                        <ChevronDown className="size-4" />
                      </IconButton>
                      {canCopy ? (
                        <IconButton size="sm" label={`Same text for all standards in ${row.title}`} disabled={!canCopyRow} onClick={() => copyToStandards(row)}>
                          <CopyCheck className="size-4" />
                        </IconButton>
                      ) : null}
                      <IconButton size="sm" className="ml-auto" label={`Remove row ${row.title}`} onClick={() => removeRow(row)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </span>
                  </th>
                  {table.columns.map((column) => {
                    const label = `${row.title}, ${column.title}`;
                    const value = row.cells[column.id] ?? "";
                    const set = (text: string) => onChange(withCell(table, row.id, column.id, text));
                    return (
                      <td key={column.id} className="border-b border-l border-line p-1.5">
                        {column.isRemarks ? (
                          <RemarkCell value={value} label={label} onChange={set} />
                        ) : (
                          <AutoTextarea
                            field
                            value={value}
                            label={label}
                            onChange={set}
                            onFocus={() => {
                              lastFocused.current[row.id] = column.id;
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {table.rows.length === 0 && emptyHint ? <p className="px-3 py-6 text-center text-[13px] text-ink-3">{emptyHint}</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange(withNewRow(table))}>
          Add row
        </Button>
        <Button variant="secondary" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange(withNewColumn(table))}>
          Add column
        </Button>
        {hidden ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(withDismissedRestored(table))}>
            Restore {hidden} removed
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending?.kind === "column") onChange(withoutColumn(table, pending.column.id));
          if (pending?.kind === "row") onChange(withoutRow(table, pending.row.id));
          if (pending?.kind === "copy") applyCopy(pending.rowId, pending.columnId, pending.targets);
          setPending(null);
        }}
        tone="danger"
        title={pending?.kind === "copy" ? "Replace the other standards' text?" : "Remove this and its text?"}
        description={pending?.kind === "copy" ? "Some standards in this row have different wording, which will be replaced." : "The text you wrote here will be deleted."}
        confirmLabel={pending?.kind === "copy" ? "Replace text" : "Remove"}
      />
    </>
  );
}
