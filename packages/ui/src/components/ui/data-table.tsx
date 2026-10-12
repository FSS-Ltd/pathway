import * as React from "react";
import { cn } from "../../lib/cn";

export type ColumnDef<TRow> = {
  id: string;
  header: string;
  accessorKey?: keyof TRow;
  cell?: (row: TRow) => React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
};

export type DataTableProps<TRow> = {
  data: TRow[];
  columns: ColumnDef<TRow>[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TRow) => void;
  className?: string;
  rowKey?: (row: TRow, index: number) => string | number;
};

export function DataTable<TRow>({
  data,
  columns,
  isLoading = false,
  emptyMessage = "No data available",
  onRowClick,
  className,
  rowKey,
}: DataTableProps<TRow>) {
  const resolveKey = (row: TRow, idx: number) =>
    rowKey ? rowKey(row, idx) : idx;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border-subtle",
        className,
      )}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-text-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/80 bg-surface">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-text-muted"
                >
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const key = resolveKey(row, rowIndex);
                const clickable = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    tabIndex={clickable ? 0 : -1}
                    className={cn(
                      "transition-colors",
                      clickable
                        ? "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/80"
                        : "hover:bg-muted/40",
                    )}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick?.(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((col) => {
                      const value =
                        col.cell?.(row) ??
                        (col.accessorKey
                          ? (row as Record<string, unknown>)[
                              col.accessorKey as string
                            ]
                          : null);
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            "px-4 py-3 text-sm text-text-primary align-middle",
                            col.align === "center" && "text-center",
                            col.align === "right" && "text-right",
                          )}
                        >
                          {value as React.ReactNode}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
