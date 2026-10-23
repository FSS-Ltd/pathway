import { financeReportCsv, financeReportFilename } from "../finance-report-csv";

describe("financeReportCsv", () => {
  it("quotes cells and protects spreadsheet formula prefixes", () => {
    const csv = financeReportCsv({
      columns: [
        { header: "Description", value: (row: { value: string }) => row.value },
        { header: "Amount", value: (row: { amount: string }) => row.amount },
      ],
      rows: [
        { value: '=HYPERLINK("https://example.test")', amount: "-125" },
        { value: "  @SUM(A1:A2)", amount: "100" },
        { value: 'A "quoted" value', amount: "0" },
      ],
    });

    expect(csv).toBe(
      '"Description","Amount"\r\n"\'=HYPERLINK(""https://example.test"")","\'-125"\r\n"\'  @SUM(A1:A2)","100"\r\n"A ""quoted"" value","0"',
    );
  });

  it.each(["+SUM(A1:A2)", "\t=SUM(A1:A2)", "\n+SUM(A1:A2)", "\r\n@SUM(A1:A2)"])(
    "neutralises formula prefixes after spreadsheet whitespace: %j",
    (value) => {
      expect(
        financeReportCsv({
          columns: [{ header: "Value", value: (row: string) => row }],
          rows: [value],
        }),
      ).toBe(`"Value"\r\n"'${value}"`);
    },
  );

  it("builds a deterministic filename from the validated report filter", () => {
    expect(
      financeReportFilename("receivables-ageing", "2026-01-01", "2026-01-31"),
    ).toBe("finance-receivables-ageing-2026-01-01-to-2026-01-31.csv");
  });
});
