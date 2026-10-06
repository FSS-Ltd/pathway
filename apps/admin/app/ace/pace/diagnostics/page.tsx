import { PaceDiagnosticHistoryPage } from "@/components/ace/pace/diagnostics/pace-diagnostic-history-page";

type SearchParams = {
  childId?: string | string[];
  subjectId?: string | string[];
};

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PaceDiagnosticHistoryPage
      childId={
        typeof searchParams.childId === "string" ? searchParams.childId : null
      }
      subjectId={
        typeof searchParams.subjectId === "string"
          ? searchParams.subjectId
          : null
      }
    />
  );
}
