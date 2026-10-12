import * as React from "react";
import { cn } from "../../lib/cn";
import {
  DataTablePaginationControls,
  type DataTablePageSize,
  type DataTablePagination,
} from "./data-table-pagination";

type SortValue = string | number | Date | null | undefined;

export type ColumnDef<TRow> = {
  id: string;
  header: string;
  accessorKey?: keyof TRow;
  cell?: (row: TRow) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  priority?: "primary" | "secondary";
  sortValue?: (row: TRow) => SortValue;
};

export type DataTableProps<TRow> = {
  data: TRow[];
  columns: ColumnDef<TRow>[];
  caption?: string;
  pagination?: DataTablePagination;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  onRowClick?: (row: TRow) => void;
  className?: string;
  rowKey?: (row: TRow, index: number) => string | number;
  selection?: {
    selectedKeys: ReadonlySet<string | number>;
    onToggle: (row: TRow, selected: boolean) => void;
    label: (row: TRow) => string;
  };
};

function compareValues(left: SortValue, right: SortValue): number {
  if (left == null) return right == null ? 0 : -1;
  if (right == null) return 1;
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() - new Date(right).getTime();
  }
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
  });
}

function isEmbeddedControl(target: EventTarget | null): boolean {
  return (
    target !== null &&
    "closest" in target &&
    typeof target.closest === "function" &&
    Boolean(
      target.closest(
        "a, button, input, select, textarea, summary, [role='button'], [data-row-action]",
      ),
    )
  );
}

export function DataTable<TRow>({
  data,
  columns,
  caption = "Results",
  pagination = { mode: "none" },
  isLoading = false,
  errorMessage,
  onRetry,
  emptyMessage = "No data available",
  onRowClick,
  className,
  rowKey,
  selection,
}: DataTableProps<TRow>) {
  const tableId = React.useId().replace(/:/g, "");
  const [clientPage, setClientPage] = React.useState(0);
  const [clientPageSize, setClientPageSize] = React.useState<DataTablePageSize>(
    pagination.mode === "client" ? (pagination.initialPageSize ?? 10) : 10,
  );
  const [sort, setSort] = React.useState<{
    id: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [expandedKeys, setExpandedKeys] = React.useState<
    ReadonlySet<string | number>
  >(new Set());
  const resetKey =
    pagination.mode === "client" ? pagination.resetKey : undefined;

  React.useEffect(() => setClientPage(0), [resetKey]);

  const sortColumn = columns.find((column) => column.id === sort?.id);
  const orderedRows = React.useMemo(() => {
    if (!sortColumn?.sortValue || !sort) return data;
    return [...data].sort(
      (left, right) =>
        compareValues(
          sortColumn.sortValue?.(left),
          sortColumn.sortValue?.(right),
        ) * (sort.direction === "asc" ? 1 : -1),
    );
  }, [data, sort, sortColumn]);
  const pageSize =
    pagination.mode === "server" ? pagination.pageSize : clientPageSize;
  const lastClientPage = Math.max(
    0,
    Math.ceil(orderedRows.length / pageSize) - 1,
  );
  const page =
    pagination.mode === "server"
      ? pagination.pageIndex
      : Math.min(clientPage, lastClientPage);
  React.useEffect(() => {
    if (pagination.mode === "client" && clientPage > lastClientPage)
      setClientPage(lastClientPage);
  }, [pagination.mode, clientPage, lastClientPage]);
  const rows =
    pagination.mode === "client"
      ? orderedRows.slice(page * pageSize, (page + 1) * pageSize)
      : orderedRows;
  const secondaryColumns = columns.filter(
    (column) => column.priority === "secondary",
  );
  const columnCount =
    columns.length +
    Number(Boolean(selection)) +
    Number(secondaryColumns.length > 0);
  const keyFor = (row: TRow, index: number) => rowKey?.(row, index) ?? index;

  const changePage = (nextPage: number) => {
    if (pagination.mode === "server") pagination.onPageChange(nextPage);
    if (pagination.mode === "client") setClientPage(nextPage);
  };
  const changePageSize = (size: DataTablePageSize) => {
    if (pagination.mode === "server") pagination.onPageSizeChange(size);
    if (pagination.mode === "client") {
      setClientPageSize(size);
      setClientPage(0);
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle",
        className,
      )}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/60 text-text-muted">
            <tr>
              {selection && (
                <th scope="col" className="w-10 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    sort?.id === column.id
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide",
                    column.priority === "secondary" && "hidden md:table-cell",
                    column.align === "center" && "text-center",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSort((current) => ({
                          id: column.id,
                          direction:
                            current?.id === column.id &&
                            current.direction === "asc"
                              ? "desc"
                              : "asc",
                        }));
                        setClientPage(0);
                      }}
                      className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                    >
                      {column.header}
                      {sort?.id === column.id
                        ? sort.direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {secondaryColumns.length > 0 && (
                <th scope="col" className="w-12 px-3 py-3 md:hidden">
                  <span className="sr-only">Details</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/80 bg-surface">
            {isLoading || errorMessage || rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-8 text-center text-text-muted"
                  role="status"
                >
                  {isLoading ? (
                    "Loading…"
                  ) : errorMessage ? (
                    <span className="inline-flex flex-wrap items-center justify-center gap-2 text-status-danger">
                      {errorMessage}
                      {onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="rounded underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                        >
                          Retry
                        </button>
                      )}
                    </span>
                  ) : (
                    emptyMessage
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const originalIndex =
                  pagination.mode === "client"
                    ? page * pageSize + rowIndex
                    : rowIndex;
                const key = keyFor(row, originalIndex);
                const selected = selection?.selectedKeys.has(key) ?? false;
                const expanded = expandedKeys.has(key);
                const detailsId = `${tableId}-details-${String(key).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <React.Fragment key={key}>
                    <tr
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-selected={selection ? selected : undefined}
                      className={cn(
                        "motion-safe:transition-colors",
                        selected && "bg-accent-primary/5",
                        onRowClick
                          ? "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-status-info"
                          : "hover:bg-muted/40",
                      )}
                      onClick={(event) => {
                        if (!isEmbeddedControl(event.target)) onRowClick?.(row);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick?.(row);
                        }
                      }}
                    >
                      {selection && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${selection.label(row)}`}
                            checked={selected}
                            onChange={(event) =>
                              selection.onToggle(row, event.target.checked)
                            }
                            className="size-4 accent-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "px-4 py-3 text-sm text-text-primary align-middle",
                            column.priority === "secondary" &&
                              "hidden md:table-cell",
                            column.align === "center" && "text-center",
                            column.align === "right" && "text-right",
                          )}
                        >
                          {column.cell
                            ? column.cell(row)
                            : column.accessorKey
                              ? (row[column.accessorKey] as React.ReactNode)
                              : null}
                        </td>
                      ))}
                      {secondaryColumns.length > 0 && (
                        <td className="px-3 py-3 md:hidden">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={detailsId}
                            aria-label={`${expanded ? "Hide" : "Show"} details for row ${String(key)}`}
                            onClick={() =>
                              setExpandedKeys((current) => {
                                const next = new Set(current);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                            className="rounded px-2 py-1 text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                          >
                            {expanded ? "Less" : "More"}
                          </button>
                        </td>
                      )}
                    </tr>
                    {secondaryColumns.length > 0 && expanded && (
                      <tr id={detailsId} className="md:hidden">
                        <td
                          colSpan={columnCount}
                          className="bg-muted/30 px-4 py-3"
                        >
                          <dl className="grid gap-3 sm:grid-cols-2">
                            {secondaryColumns.map((column) => (
                              <div key={column.id}>
                                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                  {column.header}
                                </dt>
                                <dd className="mt-1 text-sm text-text-primary">
                                  {column.cell
                                    ? column.cell(row)
                                    : column.accessorKey
                                      ? (row[
                                          column.accessorKey
                                        ] as React.ReactNode)
                                      : null}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {pagination.mode !== "none" && (
        <DataTablePaginationControls
          pageIndex={page}
          pageSize={pageSize}
          totalRows={
            pagination.mode === "client" ? orderedRows.length : undefined
          }
          canNextPage={
            pagination.mode === "server"
              ? pagination.hasNextPage
              : page < lastClientPage
          }
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      )}
    </div>
  );
}
