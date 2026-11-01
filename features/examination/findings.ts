import type { Examination, ExaminationImage, FindingsColumn, FindingsRow, FindingsTable } from "@/types/examination";

import { newId } from "./model";

export const REMARK_PRESETS = ["Significant difference", "Similar", "Not comparable"];

function columnTitleFor(image: ExaminationImage) {
  return image.role === "questioned" ? `QS${image.label.slice(1)}` : `SS${image.label.slice(1)}`;
}

/**
 * Keeps the specific findings in step with the signatures and markers: one column
 * per signature and one row per marker, standards before the questioned signature
 * and remarks last. Anything the examiner renamed, moved or removed stays that way.
 */
export function syncSpecificFindings(examination: Pick<Examination, "images" | "markers" | "specificFindings">): FindingsTable {
  const table = examination.specificFindings;
  const dismissedImages = table.dismissedImageIds ?? [];
  const dismissedMarkers = table.dismissedMarkers ?? [];

  const columns: FindingsColumn[] = table.columns
    .filter((column) => !column.imageId || examination.images.some((image) => image.id === column.imageId))
    .map((column) => {
      const image = examination.images.find((item) => item.id === column.imageId);
      return image && !column.customTitle ? { ...column, title: columnTitleFor(image) } : column;
    });

  // Standards first, so a new one lands with the others and before the questioned column.
  const ordered = [...examination.images].sort((a, b) => Number(a.role === "questioned") - Number(b.role === "questioned"));
  for (const image of ordered) {
    if (dismissedImages.includes(image.id) || columns.some((column) => column.imageId === image.id)) continue;
    const column: FindingsColumn = { id: newId(), title: columnTitleFor(image), imageId: image.id };
    const roleOf = (item: FindingsColumn) => examination.images.find((entry) => entry.id === item.imageId)?.role;
    const lastStandard = columns.findLastIndex((item) => roleOf(item) === "standard");
    const firstOther = columns.findIndex((item) => !item.imageId);
    const position =
      image.role === "standard" || lastStandard >= 0
        ? lastStandard + 1
        : firstOther >= 0
          ? firstOther
          : columns.length;
    columns.splice(position, 0, column);
  }
  if (!table.synced) columns.push({ id: newId(), title: "Remarks", imageId: null, isRemarks: true });

  const rows: FindingsRow[] = table.rows.map((row) =>
    row.markerNumber !== null && !row.customTitle ? { ...row, title: String(row.markerNumber) } : row,
  );
  for (const marker of examination.markers) {
    if (dismissedMarkers.includes(marker.number) || rows.some((row) => row.markerNumber === marker.number)) continue;
    const before = rows.findIndex((row) => row.markerNumber !== null && row.markerNumber > marker.number);
    const lastMarker = rows.findLastIndex((row) => row.markerNumber !== null);
    const row: FindingsRow = { id: newId(), title: String(marker.number), markerNumber: marker.number, cells: {} };
    rows.splice(before >= 0 ? before : lastMarker + 1, 0, row);
  }

  return { ...table, columns, rows, rowHeader: table.rowHeader ?? "Point", synced: true };
}

export function withCell(table: FindingsTable, rowId: string, columnId: string, text: string): FindingsTable {
  return {
    ...table,
    rows: table.rows.map((row) => (row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: text } } : row)),
  };
}

export function withColumnTitle(table: FindingsTable, columnId: string, title: string): FindingsTable {
  return { ...table, columns: table.columns.map((column) => (column.id === columnId ? { ...column, title, customTitle: true } : column)) };
}

export function withRowTitle(table: FindingsTable, rowId: string, title: string): FindingsTable {
  return { ...table, rows: table.rows.map((row) => (row.id === rowId ? { ...row, title, customTitle: true } : row)) };
}

export function withNewColumn(table: FindingsTable): FindingsTable {
  return { ...table, columns: [...table.columns, { id: newId(), title: "New column", imageId: null, customTitle: true }] };
}

export function withNewRow(table: FindingsTable): FindingsTable {
  return { ...table, rows: [...table.rows, { id: newId(), title: "New row", markerNumber: null, cells: {}, customTitle: true }] };
}

export function withoutColumn(table: FindingsTable, columnId: string): FindingsTable {
  const column = table.columns.find((item) => item.id === columnId);
  return {
    ...table,
    columns: table.columns.filter((item) => item.id !== columnId),
    rows: table.rows.map((row) => {
      const cells = { ...row.cells };
      delete cells[columnId];
      return { ...row, cells };
    }),
    dismissedImageIds: column?.imageId ? [...(table.dismissedImageIds ?? []), column.imageId] : table.dismissedImageIds,
  };
}

export function withoutRow(table: FindingsTable, rowId: string): FindingsTable {
  const row = table.rows.find((item) => item.id === rowId);
  return {
    ...table,
    rows: table.rows.filter((item) => item.id !== rowId),
    dismissedMarkers: row && row.markerNumber !== null ? [...(table.dismissedMarkers ?? []), row.markerNumber] : table.dismissedMarkers,
  };
}

function moved<T>(items: T[], index: number, delta: -1 | 1) {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function withColumnMoved(table: FindingsTable, columnId: string, delta: -1 | 1): FindingsTable {
  return { ...table, columns: moved(table.columns, table.columns.findIndex((item) => item.id === columnId), delta) };
}

export function withRowMoved(table: FindingsTable, rowId: string, delta: -1 | 1): FindingsTable {
  return { ...table, rows: moved(table.rows, table.rows.findIndex((item) => item.id === rowId), delta) };
}

export function withDismissedRestored(table: FindingsTable): FindingsTable {
  return { ...table, dismissedImageIds: [], dismissedMarkers: [] };
}

export function dismissedCount(table: FindingsTable) {
  return (table.dismissedImageIds?.length ?? 0) + (table.dismissedMarkers?.length ?? 0);
}

export function hasText(row: FindingsRow, columnId?: string) {
  return columnId ? Boolean(row.cells[columnId]?.trim()) : Object.values(row.cells).some((text) => text.trim());
}

/** Standard columns other than the source, for "same for all standards". */
export function otherStandardColumns(table: FindingsTable, images: ExaminationImage[], sourceId: string) {
  return table.columns.filter(
    (column) => column.id !== sourceId && images.some((image) => image.id === column.imageId && image.role === "standard"),
  );
}
