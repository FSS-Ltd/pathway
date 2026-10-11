import { Button, Card, Input, Label } from "@pathway/ui";
import type { ParsedFamilyImportRow } from "@/lib/family-identity-import";

type Props = {
  fileName: string;
  rows: ParsedFamilyImportRow[];
  childNames: ReadonlyMap<string, string>;
  validationErrors: string[];
  busy: boolean;
  disabled: boolean;
  confirmed: boolean;
  onFile: (file: File | undefined) => void;
  onConfirm: (value: boolean) => void;
  onSend: () => void;
};

export function ImportPreview({
  fileName,
  rows,
  childNames,
  validationErrors,
  busy,
  disabled,
  confirmed,
  onFile,
  onConfirm,
  onSend,
}: Props) {
  const guardianCount = rows.filter(
    ({ row }) => row.target === "GUARDIAN",
  ).length;
  return (
    <Card
      title="2. Check invitations"
      description="The file stays in this browser. The API accepts up to 10 invitations per batch and reports each result."
    >
      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="family-import-file">Completed CSV file</Label>
          <Input
            id="family-import-file"
            type="file"
            accept=".csv,text/csv"
            disabled={busy || disabled}
            onChange={(event) => onFile(event.target.files?.[0])}
            className="mt-1 max-w-lg"
          />
        </div>
        {fileName ? (
          <p className="text-sm text-text-muted">Selected: {fileName}</p>
        ) : null}
        {validationErrors.length ? (
          <div
            role="alert"
            className="rounded-lg border border-status-danger p-3 text-sm text-status-danger"
          >
            <p className="font-semibold">Fix the file before sending</p>
            <ul className="mt-1 list-disc pl-5">
              {validationErrors.slice(0, 20).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {validationErrors.length > 20 ? (
              <p>And {validationErrors.length - 20} more rows.</p>
            ) : null}
          </div>
        ) : null}
        {rows.length > 0 && validationErrors.length === 0 ? (
          <div className="space-y-3">
            <p role="status" className="text-sm font-medium text-text-primary">
              {rows.length} invitations ready: {guardianCount} guardians,{" "}
              {rows.length - guardianCount} students.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  First ten family invitations in the CSV file
                </caption>
                <thead className="bg-muted text-text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      CSV row
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Child
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Account
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Target
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map(({ csvRow, row }) => (
                    <tr key={csvRow} className="border-t border-border-subtle">
                      <td className="px-3 py-2">{csvRow}</td>
                      <td className="px-3 py-2">
                        {childNames.get(row.childId)}
                      </td>
                      <td className="px-3 py-2 break-all">{row.email}</td>
                      <td className="px-3 py-2">
                        {row.target === "GUARDIAN" ? "Guardian" : "Student"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 ? (
              <p className="text-xs text-text-muted">
                Showing the first 10 rows. All {rows.length} rows will be
                processed.
              </p>
            ) : null}
            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => onConfirm(event.target.checked)}
                disabled={busy}
                className="mt-1"
              />
              I confirm that each listed guardian has legal access and each
              listed student has school approval under its age, consent, and
              safeguarding policy.
            </label>
            <Button
              type="button"
              disabled={!confirmed || busy}
              onClick={onSend}
            >
              {busy
                ? "Sending invitations…"
                : `Send ${rows.length} invitations`}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
