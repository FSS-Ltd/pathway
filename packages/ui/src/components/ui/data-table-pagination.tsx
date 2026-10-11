import * as React from "react";

export const DATA_TABLE_PAGE_SIZES = [10, 25, 50] as const;
export type DataTablePageSize = (typeof DATA_TABLE_PAGE_SIZES)[number];

export type DataTablePagination =
  | { mode: "none" }
  | {
      mode: "client";
      initialPageSize?: DataTablePageSize;
      resetKey?: string | number;
    }
  | {
      mode: "server";
      pageIndex: number;
      pageSize: DataTablePageSize;
      hasNextPage: boolean;
      onPageChange: (pageIndex: number) => void;
      onPageSizeChange: (pageSize: DataTablePageSize) => void;
    };

type PaginationControlsProps = {
  pageIndex: number;
  pageSize: DataTablePageSize;
  canNextPage: boolean;
  totalRows?: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: DataTablePageSize) => void;
};

export function DataTablePaginationControls({
  pageIndex,
  pageSize,
  canNextPage,
  totalRows,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const pageSizeId = React.useId();
  const firstRow = pageIndex * pageSize + 1;
  const lastRow = Math.min((pageIndex + 1) * pageSize, totalRows ?? Infinity);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface px-4 py-3 text-sm text-text-secondary">
      <label htmlFor={pageSizeId} className="flex items-center gap-2">
        Rows per page
        <select
          id={pageSizeId}
          value={pageSize}
          onChange={(event) => {
            const selected = DATA_TABLE_PAGE_SIZES.find(
              (size) => size === Number(event.target.value),
            );
            if (selected) onPageSizeChange(selected);
          }}
          className="rounded-md border border-border-subtle bg-surface px-2 py-1 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
        >
          {DATA_TABLE_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span aria-live="polite">
          {totalRows === undefined
            ? `Page ${pageIndex + 1}`
            : totalRows === 0
              ? "0 rows"
              : `${firstRow}–${lastRow} of ${totalRows}`}
        </span>
        <button
          type="button"
          disabled={pageIndex === 0}
          onClick={() => onPageChange(pageIndex - 1)}
          className="rounded-md border border-border-subtle px-3 py-1.5 text-text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!canNextPage}
          onClick={() => onPageChange(pageIndex + 1)}
          className="rounded-md border border-border-subtle px-3 py-1.5 text-text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
        >
          Next
        </button>
      </div>
    </div>
  );
}
