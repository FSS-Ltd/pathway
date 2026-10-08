"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "@/lib/use-session-compat";
import { Card, Badge, Button } from "@pathway/ui";
import { API_BASE_URL, apiFetch } from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { meetsAccessRequirement } from "@/lib/access";

type MyNextHandoverUnavailable = { available: false };

type MyNextHandoverAvailable = {
  available: true;
  sessionId: string;
  startsAt: string;
  handoverDate: string;
  logs: Array<{
    id: string;
    groupId: string;
    handoverDate: string;
    content: unknown;
  }>;
};

type MyNextHandoverResponse =
  | MyNextHandoverUnavailable
  | MyNextHandoverAvailable;

type ParsedChildHandover = {
  childId?: string;
  name?: string;
  points?: string; // newline-separated lines → bullets
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
      <pre className="max-h-64 overflow-auto rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-text-primary">
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

export default function HandoverPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { role } = useAdminAccess();
  const canManageLogs = meetsAccessRequirement(role, "site-admin-or-higher");
  const [data, setData] = React.useState<MyNextHandoverResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;

    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`${API_BASE_URL}/handover/my-next`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            body || `Failed to load handover (${res.status.toString()})`,
          );
        }
        const json = (await res.json()) as MyNextHandoverResponse;
        setData(json);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to load handover",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [sessionStatus, session]);

  const renderContent = () => {
    if (isLoading || sessionStatus === "loading") {
      return (
        <Card
          title="Next session handover"
          description="Loading the latest handover for your next session."
        >
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        </Card>
      );
    }

    if (error) {
      return (
        <Card
          title="Next session handover"
          description="We couldn't load your handover right now."
        >
          <p className="text-sm text-status-danger">{error}</p>
        </Card>
      );
    }

    if (!data || data.available === false) {
      return (
        <Card
          title="Next session handover"
          description="Handover appears here once an admin has approved notes for your next scheduled session."
        >
          <p className="text-sm text-text-muted">
            There is no approved handover available yet. Once your next session
            has an approved handover, it will show here automatically.
          </p>
        </Card>
      );
    }

    const startsAt = new Date(data.startsAt);
    const handoverDate = new Date(data.handoverDate);
    const startsAtLabel = startsAt.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const handoverDateLabel = handoverDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    return (
      <div className="space-y-4">
        <Card
          title="Next session handover"
          description="Approved handover notes for your next scheduled session."
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm text-text-muted">Next session</div>
              <div className="text-base font-medium text-text-primary">
                {startsAtLabel}
              </div>
            </div>
            <div className="space-y-1 text-sm text-text-muted">
              <div>Handover applies to:</div>
              <div className="font-medium text-text-primary">
                {handoverDateLabel}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {data.logs.map((log) => (
            <Card
              key={log.id}
              title={`Group handover`}
              description="Handover notes for one of your assigned groups."
              actions={
                <Badge variant="accent">
                  Approved
                </Badge>
              }
            >
              <div className="mb-2 text-xs text-text-muted">
                Group ID:{" "}
                <span className="font-mono text-[11px] text-text-muted">
                  {log.groupId}
                </span>
              </div>
              {renderHandoverContent(log.content)}
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {canManageLogs && (
        <div className="flex items-center justify-end">
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/handover">Manage handover logs</Link>
          </Button>
        </div>
      )}
      {renderContent()}
    </div>
  );
}

