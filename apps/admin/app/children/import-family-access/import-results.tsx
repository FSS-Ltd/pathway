import { Card } from "@pathway/ui";
import type { FamilyImportResult } from "@/lib/family-identity-import-api";

export type DisplayResult = FamilyImportResult & { csvRow: number };

export function ImportResults({ results }: { results: DisplayResult[] }) {
  if (!results.length) return null;
  const count = (status: FamilyImportResult["status"]) =>
    results.filter((result) => result.status === status).length;
  return (
    <Card
      title="Import results"
      description="Existing invitations were left unchanged. Review any failed row and resend from the child profile when delivery needs attention."
    >
      <p role="status" className="mt-3 text-sm text-text-muted">
        {count("invited")} sent, {count("existing")} existing, {count("failed")}{" "}
        need attention.
      </p>
      <ul className="mt-3 divide-y divide-border-subtle text-sm">
        {results.map((result) => (
          <li key={result.csvRow} className="flex flex-wrap gap-2 py-2">
            <span className="font-medium text-text-primary">
              Row {result.csvRow}: {result.status}
            </span>
            <span className="text-text-muted">{result.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
