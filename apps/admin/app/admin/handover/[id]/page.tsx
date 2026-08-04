"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Badge, Button, Card } from "@pathway/ui";
import {
  type AdminHandoverDetail,
  type AdminHandoverVersion,
  approveAdminHandover,
  fetchAdminHandoverDetail,
  fetchAdminHandoverVersions,
  rejectAdminHandover,
  fetchGroups,
  type GroupOption,
} from "../../../../lib/api-client";
import { useAdminAccess } from "../../../../lib/use-admin-access";
import { meetsAccessRequirement } from "../../../../lib/access";

type ParsedChildHandover = {
  childId?: string;
  name?: string;
  points?: string;
  testsCompleted?: boolean;
  movedToNewLevel?: boolean;
  newLevel?: string | null;
  notes?: string | null;
};

type ParsedHandoverContent = {
  summary?: string;
  notes?: string[];
  children?: ParsedChildHandover[];
};

function parseHandoverContent(raw: unknown): ParsedHandoverContent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const summary =
    typeof obj.summary === "string" && obj.summary.trim().length > 0
      ? obj.summary
      : undefined;

  const notes = Array.isArray(obj.notes)
    ? obj.notes.filter((n): n is string => typeof n === "string" && n.trim() !== "")
    : undefined;

  const children = Array.isArray(obj.children)
    ? obj.children
        .map((c) => (typeof c === "object" && c ? (c as Record<string, unknown>) : null))
        .filter((c): c is Record<string, unknown> => !!c)
        .map((c) => ({
          childId: typeof c.childId === "string" ? c.childId : undefined,
          name: typeof c.name === "string" ? c.name : undefined,
          points: typeof c.points === "string" ? c.points : undefined,
          testsCompleted:
            typeof c.testsCompleted === "boolean" ? c.testsCompleted : undefined,
          movedToNewLevel:
            typeof c.movedToNewLevel === "boolean" ? c.movedToNewLevel : undefined,
          newLevel:
            typeof c.newLevel === "string" && c.newLevel.trim().length > 0
              ? c.newLevel
              : null,
          notes:
            typeof c.notes === "string" && c.notes.trim().length > 0
              ? c.notes
              : null,
        }))
    : undefined;

  if (!summary && (!notes || notes.length === 0) && (!children || children.length === 0)) {
    return null;
  }

  return { summary, notes, children };
}

function renderHandoverContent(raw: unknown) {
  const parsed = parseHandoverContent(raw);

  if (!parsed) {
    return (
      <pre className="max-h-80 overflow-auto rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs leading-relaxed text-text-primary">
        {JSON.stringify(raw ?? {}, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      {parsed.summary && (
        <div>
          <div className="text-xs font-medium text-text-muted mb-1">Summary</div>
          <p className="text-sm text-text-primary whitespace-pre-wrap">
            {parsed.summary}
          </p>
        </div>
      )}
      {parsed.notes && parsed.notes.length > 0 && (
        <div>
          <div className="text-xs font-medium text-text-muted mb-1">
            Key notes
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-primary">
            {parsed.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {parsed.children && parsed.children.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-muted mb-1">
            Per-child handover
          </div>
          <div className="space-y-2">
            {parsed.children.map((child, idx) => {
              const pointLines =
                typeof child.points === "string" && child.points.trim()
                  ? child.points
                      .split("\n")
                      .map((l) => l.trim())
                      .filter((l) => l.length > 0)
                  : [];
              const hasPoints = pointLines.length > 0;
              const hasLegacy =
                child.testsCompleted ||
                child.movedToNewLevel ||
                (child.newLevel && child.newLevel.trim()) ||
                (child.notes && child.notes.trim());

              return (
                <div
                  key={child.childId ?? idx}
                  className="rounded-md border border-border-subtle bg-surface-alt px-3 py-2"
                >
                  <div className="text-sm font-medium text-text-primary">
                    {child.name ?? "Child"}
                  </div>
                  {hasPoints ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-primary">
                      {pointLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : hasLegacy ? (
                    <div className="mt-2 space-y-1 text-xs text-text-primary">
                      {child.testsCompleted && <div>Tests completed</div>}
                      {child.movedToNewLevel && (
                        <div>
                          {child.newLevel?.trim()
                            ? `Moved to new level: ${child.newLevel}`
                            : "Moved to new level"}
                        </div>
                      )}
                      {child.notes?.trim() && <div>{child.notes}</div>}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-text-muted">
                      No changes recorded
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const statusTone: Record<
  AdminHandoverDetail["status"],
  "default" | "warning" | "success"
> = {
  DRAFT: "default",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
};

const statusLabel: Record<AdminHandoverDetail["status"], string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
};

export default function AdminHandoverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { role } = useAdminAccess();
  const canAccess = meetsAccessRequirement(role, "site-admin-or-higher");

  const [detail, setDetail] = React.useState<AdminHandoverDetail | null>(null);
  const [versions, setVersions] = React.useState<AdminHandoverVersion[] | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [versionsError, setVersionsError] = React.useState<string | null>(null);
  const [approveLoading, setApproveLoading] = React.useState(false);
  const [approveError, setApproveError] = React.useState<string | null>(null);
  const [rejectLoading, setRejectLoading] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"versions" | "review">("versions");

  const groupNameMap = React.useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const loadDetail = React.useCallback(async () => {
    if (sessionStatus !== "authenticated" || !id) return;
    setIsLoadingDetail(true);
    setError(null);
    try {
      const [g, d] = await Promise.all([
        fetchGroups({ activeOnly: true }),
        fetchAdminHandoverDetail(id),
      ]);
      setGroups(g);
      setDetail(d);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load handover detail.",
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }, [id, sessionStatus]);

  const loadVersions = React.useCallback(async () => {
    if (sessionStatus !== "authenticated" || !id) return;
    setIsLoadingVersions(true);
    setVersionsError(null);
    try {
      const v = await fetchAdminHandoverVersions(id);
      setVersions(v);
      if (!selectedVersionId && v.length > 0) {
        setSelectedVersionId(v[0]?.id ?? null);
      }
    } catch (err) {
      setVersionsError(
        err instanceof Error ? err.message : "Failed to load versions.",
      );
    } finally {
      setIsLoadingVersions(false);
    }
  }, [id, sessionStatus, selectedVersionId]);

  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      void loadDetail();
    }
  }, [sessionStatus, loadDetail]);

  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      void loadVersions();
    }
  }, [sessionStatus, loadVersions]);

  const handleApprove = async () => {
    if (!detail || detail.status === "APPROVED") return;
    setApproveLoading(true);
    setApproveError(null);
    try {
      const updated = await approveAdminHandover(detail.id, "Approved by admin");
      setDetail(updated);
      // After approval, staff "my-next" endpoint will see it via backend logic.
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : "Failed to approve handover.",
      );
    } finally {
      setApproveLoading(false);
    }
  };

  const handleReject = async () => {
    if (!detail || detail.status !== "PENDING_APPROVAL") return;
    if (!rejectReason.trim()) {
      setRejectError("Please provide a short reason for rejection.");
      return;
    }
    setRejectLoading(true);
    setRejectError(null);
    try {
      const updated = await rejectAdminHandover(
        detail.id,
        rejectReason.trim(),
        "DRAFT",
      );
      setDetail(updated);
      setRejectReason("");
    } catch (err) {
      setRejectError(
        err instanceof Error ? err.message : "Failed to reject handover.",
      );
    } finally {
      setRejectLoading(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/handover">Back to handover</Link>
        </Button>
        <Card>
          <div className="space-y-2 text-sm text-status-danger">
            <p className="font-semibold">Access denied</p>
            <p className="text-xs text-text-muted">
              You don&apos;t have permission to view this handover log.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoadingDetail || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/handover">Back to handover logs</Link>
        </Button>
        <Card>
          <p className="text-sm text-text-muted">Loading handover…</p>
        </Card>
      </div>
    );
  }

  const handoverDate = new Date(detail.handoverDate);
  const handoverDateLabel = Number.isNaN(handoverDate.getTime())
    ? detail.handoverDate
    : handoverDate.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  const approvedAtLabel = detail.approvedAt
    ? new Date(detail.approvedAt).toLocaleString()
    : null;

  const groupName = groupNameMap.get(detail.groupId) ?? detail.groupId;

  const selectedVersion =
    versions?.find((v) => v.id === selectedVersionId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/handover">Back to handover logs</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => router.push("/handover")}
          >
            View staff handover
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusTone[detail.status]}>
            {statusLabel[detail.status]}
          </Badge>
          {detail.status !== "APPROVED" && (
            <Button
              type="button"
              size="sm"
              onClick={handleApprove}
              disabled={approveLoading}
            >
              {approveLoading ? "Approving…" : "Approve"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card>
          <div className="space-y-2 rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
            <p className="font-semibold">Unable to load handover</p>
            <p className="text-xs text-text-muted">{error}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadDetail()}
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {approveError && (
        <Card>
          <div className="space-y-1 text-sm text-status-danger">
            <p className="font-semibold">Approval failed</p>
            <p className="text-xs text-text-muted">{approveError}</p>
          </div>
        </Card>
      )}

      {rejectError && (
        <Card>
          <div className="space-y-1 text-sm text-status-danger">
            <p className="font-semibold">Reject failed</p>
            <p className="text-xs text-text-muted">{rejectError}</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary font-heading">
                Handover for {groupName}
              </h1>
              <p className="text-sm text-text-muted">
                Handover date: {handoverDateLabel}
              </p>
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Group / class</dt>
              <dd className="text-sm font-medium text-text-primary">
                {groupName}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Status</dt>
              <dd className="text-sm text-text-primary">
                {statusLabel[detail.status]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Created at</dt>
              <dd className="text-sm text-text-muted">
                {new Date(detail.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Last updated</dt>
              <dd className="text-sm text-text-muted">
                {new Date(detail.updatedAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Approved at</dt>
              <dd className="text-sm text-text-muted">
                {approvedAtLabel ?? "Not yet approved"}
              </dd>
            </div>
          </dl>

          <div>
            <dt className="mb-1 block text-xs text-text-muted">
              Current handover content
            </dt>
            <dd>{renderHandoverContent(detail.currentContentJson)}</dd>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-1 border-b border-border-subtle pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("versions")}
            className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info ${
              activeTab === "versions"
                ? "border-accent-primary/50 bg-accent-primary text-text-inverse shadow-sm"
                : "border-transparent bg-transparent text-text-muted hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            Versions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("review")}
            className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info ${
              activeTab === "review"
                ? "border-accent-primary/50 bg-accent-primary text-text-inverse shadow-sm"
                : "border-transparent bg-transparent text-text-muted hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            Review &amp; decision
          </button>
        </div>

        {activeTab === "versions" && (
        <div className="mt-3">
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  Version history (most recent first).
                </p>
                {versionsError && (
                  <div className="space-y-1 rounded-md border border-status-danger/20 bg-status-danger/5 p-2 text-xs text-status-danger">
                    <p className="font-semibold">Unable to load versions</p>
                    <p className="text-text-muted">{versionsError}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadVersions()}
                    >
                      Retry
                    </Button>
                  </div>
                )}
                {isLoadingVersions && !versions && (
                  <p className="text-xs text-text-muted">Loading versions…</p>
                )}
                {versions && versions.length === 0 && !isLoadingVersions ? (
                  <p className="text-xs text-text-muted">
                    No versions recorded yet.
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {versions?.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedVersionId(v.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-xs transition hover:bg-surface-alt ${
                          selectedVersionId === v.id
                            ? "border-accent-strong bg-surface-alt"
                            : "border-border-subtle bg-surface"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-text-primary">
                            v{v.versionNumber}
                          </span>
                          <span className="text-[11px] text-text-muted">
                            {new Date(v.editedAt).toLocaleString()}
                          </span>
                        </div>
                        {v.changeSummary && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-text-muted">
                            {v.changeSummary}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-text-muted">
                  Snapshot for the selected version.
                </p>
                {selectedVersion ? (
                  <div className="max-h-80 overflow-auto rounded-md border border-border-subtle bg-surface px-3 py-2">
                    {renderHandoverContent(selectedVersion.contentSnapshotJson)}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Select a version on the left to view its snapshot.
                  </p>
                )}
              </div>
            </div>
        </div>
        )}

        {activeTab === "review" && (
          <div className="mt-3 space-y-3">
            {detail.status === "PENDING_APPROVAL" ? (
              <>
                <p className="text-sm text-text-muted">
                  Review the handover content and either approve it (making it
                  visible to incoming staff) or send it back to draft with a
                  short reason.
                </p>
                <div className="space-y-2">
                  <label
                    htmlFor="reject-reason"
                    className="text-xs font-medium text-text-muted"
                  >
                    Reason for rejection (shared with staff)
                  </label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="min-h-[80px] w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                    placeholder="Explain what needs changing before this handover can be approved."
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={handleApprove}
                    disabled={approveLoading}
                  >
                    {approveLoading ? "Approving…" : "Approve"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleReject}
                    disabled={rejectLoading}
                  >
                    {rejectLoading ? "Rejecting…" : "Reject back to draft"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">
                {detail.status === "APPROVED"
                  ? "This handover has already been approved."
                  : "Only handovers submitted for approval can be reviewed here. Submit the handover for approval from the write page first."}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

