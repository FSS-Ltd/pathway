import type { FinanceReportType } from "./dto/finance-report.dto";

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => string | number | null;
}

export function financeReportCsv<Row>(input: {
  columns: readonly CsvColumn<Row>[];
  rows: readonly Row[];
}): string {
  return [
    input.columns.map(({ header }) => encodeCsvCell(header)).join(","),
    ...input.rows.map((row) =>
      input.columns.map(({ value }) => encodeCsvCell(value(row))).join(","),
    ),
  ].join("\r\n");
}

export function financeReportFilename(
  type: FinanceReportType,
  from: string,
  to: string,
): string {
  return `finance-${type}-${from}-to-${to}.csv`;
}

function encodeCsvCell(value: string | number | null): string {
  const raw = value === null ? "" : String(value);
  const safe = /^[\s]*[-=+@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
