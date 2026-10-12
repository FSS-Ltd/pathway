"use client";

// Safeguarding overview is intentionally metadata-only.
// Do NOT render concern/note free text or DSAR-level data here.
// Any change that exposes more detail must go through a safeguarding review.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Plus } from "lucide-react";
import { Badge, Button, Card, DataTable, type ColumnDef } from "@pathway/ui";
import {
  AdminConcernRow,
  AdminNotesSummary,
  fetchNotesSummary,
  fetchOpenConcerns,
  setApiClientToken,
} from "../../lib/api-client";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canAccessSafeguardingAdmin } from "../../lib/access";
import { NoAccessCard } from "../../components/no-access-card";

const statusTone: Record<
  AdminConcernRow["status"],
  "warning" | "accent" | "success" | "default"
> = {
  open: "warning",
  in_review: "accent",
  closed: "success",
  other: "default",
};

export default function SafeguardingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [concerns, setConcerns] = React.useState<AdminConcernRow[]>([]);
  const [notesSummary, setNotesSummary] =
    React.useState<AdminNotesSummary | null>(null);
  const [isLoadingConcerns, setIsLoadingConcerns] = React.useState(true);
  const [isLoadingNotes, setIsLoadingNotes] = React.useState(true);
  const [concernError, setConcernError] = React.useState<string | null>(null);
  const [notesError, setNotesError] = React.useState<string | null>(null);

  // All hooks must be called before any conditional returns
  const loadConcerns = React.useCallback(async () => {
    setIsLoadingConcerns(true);
    setConcernError(null);
    try {
      const result = await fetchOpenConcerns();
      setConcerns(result);
    } catch (err) {
      setConcernError(
        err instanceof Error ? err.message : "Failed to load concerns",
      );
    } finally {
      setIsLoadingConcerns(false);
    }
  }, []);

  const loadNotes = React.useCallback(async () => {
    setIsLoadingNotes(true);
    setNotesError(null);
    try {
      const result = await fetchNotesSummary();
      setNotesSummary(result);
    } catch (err) {
      setNotesError(
        err instanceof Error ? err.message : "Failed to load notes summary",
      );
    } finally {
      setIsLoadingNotes(false);
    }
  }, []);

  React.useEffect(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session ||
      isLoadingAccess ||
      !canAccessSafeguardingAdmin(role)
    ) {
      return;
    }
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
    void loadConcerns();
    void loadNotes();
  }, [sessionStatus, session, isLoadingAccess, role, loadConcerns, loadNotes]);

  const columns = React.useMemo<ColumnDef<AdminConcernRow>[]>(
    () => [
      {
        id: "created",
        header: "Created",
        cell: (row) => (
          <span className="text-sm text-text-muted">
            {new Date(row.createdAt).toLocaleString()}
          </span>
        ),
        width: "180px",
      },
      {
        id: "child",
        header: "Child",
        // SAFEGUARDING: childLabel is initials/generic only.
        cell: (row) => (
          <span className="text-sm font-semibold text-text-primary">
            {row.childLabel}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={statusTone[row.status]} className="capitalize">
            {row.status.replace("_", " ")}
          </Badge>
        ),
        width: "130px",
        align: "center",
      },
      {
        id: "category",
        header: "Category",
        cell: (row) => (
          <span className="text-sm text-text-muted">
            {row.category ?? "-"}
          </span>
        ),
        width: "140px",
      },
      {
        id: "reportedBy",
        header: "Reported by",
        cell: (row) => (
          <span className="text-sm text-text-muted">
            {row.reportedByLabel ?? "-"}
          </span>
        ),
        width: "140px",
      },
    ],
    [],
  );

  // Access control guard - after all hooks
  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessSafeguardingAdmin(role)) {
    return (
      <NoAccessCard
        title="Safeguarding admin is not accessible"
        message="Safeguarding concerns and notes are managed in the Nexsteps staff mobile app. This admin view is restricted to organisation administrators."
      />
    );
  }

  const concernContent = () => {
    if (isLoadingConcerns) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface px-3 py-3"
            >
              <div className="flex flex-col gap-2">
                <span className="h-3 w-32 animate-pulse rounded bg-muted" />
                <span className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <span className="h-5 w-14 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      );
    }
    if (concernError) {
      return (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              Couldn’t load concerns right now.
            </span>
            <Button size="sm" variant="secondary" onClick={loadConcerns}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{concernError}</p>
        </div>
      );
    }
    if (concerns.length === 0) {
      return (
        <p className="text-sm text-text-muted">
          No open concerns recorded for this organisation.
        </p>
      );
    }
    return (
      <DataTable
        data={concerns}
        columns={columns}
        isLoading={false}
        emptyMessage="No open concerns."
        onRowClick={(row) => router.push(`/safeguarding/concerns/${row.id}`)}
      />
    );
  };

  const notesContent = () => {
    if (isLoadingNotes) {
      return (
        <div className="space-y-2">
          <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      );
    }
    if (notesError) {
      return (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Couldn’t load notes summary.</span>
            <Button size="sm" variant="secondary" onClick={loadNotes}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{notesError}</p>
        </div>
      );
    }
    if (!notesSummary) {
      return (
        <p className="text-sm text-text-muted">
              Positive notes and wellbeing records will be summarised here in a future
          update.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
          <p className="text-xs text-text-muted">Total notes</p>
          <p className="text-lg font-semibold text-text-primary">
            {notesSummary.totalNotes}
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
          <p className="text-xs text-text-muted">Visible to parents</p>
          <p className="text-lg font-semibold text-text-primary">
            {notesSummary.visibleToParents}
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
          <p className="text-xs text-text-muted">Staff-only</p>
          <p className="text-lg font-semibold text-text-primary">
            {notesSummary.staffOnly}
          </p>
        </div>
      </div>
    );
  };

  const openCount = concerns.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Safeguarding
          </h1>
          <p className="text-sm text-text-muted">
            Overview of concerns and positive notes. Metadata only; detailed
            records stay in safeguarding workflows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="destructive" size="sm" className="min-w-[11.5rem]">
            <Link href="/safeguarding/concerns/new" className="inline-flex items-center justify-center gap-2 w-full">
              <Plus className="h-4 w-4" />
              Create concern
            </Link>
          </Button>
          <Button asChild variant="success" size="sm" className="min-w-[11.5rem]">
            <Link href="/safeguarding/notes/new" className="inline-flex items-center justify-center gap-2 w-full">
              <Plus className="h-4 w-4" />
              Create positive note
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
          <p className="text-xs text-text-muted">Open concerns</p>
          <p className="text-lg font-semibold text-text-primary">
            {isLoadingConcerns ? "—" : openCount}
          </p>
        </div>
        {notesSummary != null && (
          <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
            <p className="text-xs text-text-muted">Positive notes (total)</p>
            <p className="text-lg font-semibold text-text-primary">
              {notesSummary.totalNotes}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Open Concerns">
          {concernContent()}
          <p className="mt-3 text-xs text-text-muted">
            Metadata only - open safeguarding details in the dedicated workflow.
          </p>
        </Card>
        <Card title="Positive Notes & Wellbeing Summary">
          {notesContent()}
          <p className="mt-3 text-xs text-text-muted">
            High-level counts only; note text stays in safeguarding workflows.
          </p>
        </Card>
      </div>
    </div>
  );
}
