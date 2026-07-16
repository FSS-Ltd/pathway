"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, Button, Input, Label, Badge } from "@pathway/ui";
import {
  fetchGroups,
  fetchHandoverById,
  type GroupOption,
  type HandoverLogStatus,
  upsertHandoverDraft,
  updateHandover,
  fetchChildren,
  type AdminChildRow,
} from "@/lib/api-client";
import { toLocalDateKey } from "@/lib/date";
import { toast } from "sonner";

type HandoverFormState = {
  groupId: string;
  handoverDate: string; // yyyy-mm-dd
  summary: string;
  notes: string; // newline-separated notes
  children: PerChildHandover[];
  status: HandoverLogStatus | null;
  handoverId: string | null;
};

type PerChildHandover = {
  childId: string;
  name: string;
  points: string; // newline-separated lines, shown as bullet points
};

export default function WriteHandoverPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const prefilledGroupId = searchParams.get("groupId") ?? "";
  const prefilledDate =
    searchParams.get("handoverDate") ?? toLocalDateKey(new Date());
  const isSessionScoped = Boolean(searchParams.get("sessionId"));
  const handoverIdParam = searchParams.get("handoverId");
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [handoverLoaded, setHandoverLoaded] = React.useState(false);
  const [form, setForm] = React.useState<HandoverFormState>({
    groupId: prefilledGroupId,
    handoverDate: prefilledDate,
    summary: "",
    notes: "",
    children: [],
    status: null,
    handoverId: null,
  });
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof HandoverFormState, string>>
  >({});
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchGroups({ activeOnly: true })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [sessionStatus]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !handoverIdParam) return;
    let cancelled = false;
    fetchHandoverById(handoverIdParam)
      .then((h) => {
        if (cancelled) return;
        const content = (h.currentContentJson ?? {}) as {
          summary?: string;
          notes?: string[];
          children?: Array<{
            childId?: string;
            name?: string;
            points?: string;
            testsCompleted?: boolean;
            movedToNewLevel?: boolean;
            newLevel?: string | null;
            notes?: string | null;
          }>;
        };
        const handoverDateStr =
          typeof h.handoverDate === "string"
            ? h.handoverDate.slice(0, 10)
            : new Date(h.handoverDate).toISOString().slice(0, 10);
        setForm({
          groupId: h.groupId,
          handoverDate: handoverDateStr,
          summary: typeof content.summary === "string" ? content.summary : "",
          notes: Array.isArray(content.notes)
            ? content.notes.filter((n): n is string => typeof n === "string").join("\n")
            : "",
          children: (Array.isArray(content.children) ? content.children : []).map(
            (c) => {
              if (typeof c.points === "string" && c.points.trim()) {
                return {
                  childId: c.childId ?? "",
                  name: c.name ?? "",
                  points: c.points,
                };
              }
              const lines: string[] = [];
              if (c.testsCompleted) lines.push("Completed tests today");
              if (c.movedToNewLevel) {
                const level = c.newLevel && String(c.newLevel).trim();
                lines.push(level ? `Moved to new level: ${level}` : "Moved to new level");
              }
              if (c.notes && String(c.notes).trim()) lines.push(String(c.notes).trim());
              return {
                childId: c.childId ?? "",
                name: c.name ?? "",
                points: lines.join("\n"),
              };
            },
          ),
          status: h.status,
          handoverId: h.id,
        });
        setHandoverLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHandoverLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, handoverIdParam]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (handoverIdParam) return;
    if (!form.groupId) {
      setForm((prev) => ({ ...prev, children: [] }));
      return;
    }
    fetchChildren()
      .then((all: AdminChildRow[]) => {
        const childrenForGroup = all.filter(
          (c) => c.primaryGroupId === form.groupId,
        );
        setForm((prev) => ({
          ...prev,
          children: childrenForGroup.map((c) => ({
            childId: c.id,
            name: c.fullName,
            points: "",
          })),
        }));
      })
      .catch(() => {
        setForm((prev) => ({ ...prev, children: [] }));
      });
  }, [sessionStatus, form.groupId]);

  const handleChange = <K extends keyof HandoverFormState>(
    key: K,
    value: HandoverFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const buildContentJson = (): unknown => {
    const lines = form.notes
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return {
      summary: form.summary.trim(),
      notes: lines,
      children: form.children.map((c) => ({
        childId: c.childId,
        name: c.name,
        points: c.points.trim(),
      })),
    };
  };

  const childPointsPlaceholder =
    "Completed math test 205\nMoved up to math 206\nStruggled with english\nHad an emotional moment at lunch";

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!form.groupId) next.groupId = "Select a group.";
    if (!form.handoverDate) next.handoverDate = "Choose a date.";
    if (!form.summary.trim()) next.summary = "Summary is required.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (submitForApproval: boolean) => {
    setError(null);
    if (!validate()) return;
    const json = buildContentJson();
    const changeSummary = submitForApproval
      ? "Submitted for approval"
      : "Saved draft";

    setSubmitting(true);
    try {
      let id: string;
      let status: HandoverLogStatus;

      if (form.handoverId) {
        const updated = await updateHandover(form.handoverId, {
          contentJson: json,
          changeSummary,
          ...(submitForApproval ? { status: "PENDING_APPROVAL" as const } : {}),
        });
        id = updated.id;
        status = updated.status;
      } else {
        const draft = await upsertHandoverDraft({
          groupId: form.groupId,
          handoverDate: form.handoverDate,
          contentJson: json,
          changeSummary,
        });
        id = draft.id;
        status = draft.status;
        if (submitForApproval && status !== "APPROVED") {
          const updated = await updateHandover(id, {
            status: "PENDING_APPROVAL",
            changeSummary: "Submitted for approval",
          });
          status = updated.status;
        }
      }

      setForm((prev) => ({
        ...prev,
        handoverId: id,
        status,
      }));
      toast.success(
        submitForApproval
          ? "Handover submitted for approval."
          : "Handover draft saved.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn’t save this handover.",
      );
      toast.error(
        err instanceof Error
          ? err.message
          : "We couldn’t save this handover. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isApproved = form.status === "APPROVED";
  const loadingExisting = Boolean(handoverIdParam && !handoverLoaded);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push("/handover")}
        >
          Back to handover
        </Button>
      </div>

      {loadingExisting ? (
        <Card title="Write handover">
          <p className="text-muted-foreground">Loading handover…</p>
        </Card>
      ) : (
      <Card
        title="Write handover"
        description="Draft handover notes for your next session. Admins will review and approve before they appear for incoming staff."
        actions={
          form.status ? (
            <Badge
              variant={
                form.status === "APPROVED"
                  ? "success"
                  : form.status === "PENDING_APPROVAL"
                    ? "warning"
                    : "default"
              }
            >
              {form.status === "APPROVED"
                ? "Approved"
                : form.status === "PENDING_APPROVAL"
                  ? "Pending approval"
                  : "Draft"}
            </Badge>
          ) : null
        }
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        {isApproved ? (
          <div className="mb-4 rounded-md border border-border-subtle bg-muted/40 px-3 py-2 text-sm text-text-muted">
            This handover has been approved and can no longer be edited.
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="groupId">Group / class</Label>
              <select
                id="groupId"
                disabled={submitting || isApproved || isSessionScoped}
                className="h-9 rounded-md border border-border-subtle bg-surface px-2 text-sm text-text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                value={form.groupId}
                onChange={(e) => handleChange("groupId", e.target.value)}
              >
                <option value="">Select a group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {fieldErrors.groupId ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.groupId}
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  Choose the age group/class this handover applies to.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="handoverDate">Handover date</Label>
              <Input
                id="handoverDate"
                type="date"
                disabled={submitting || isApproved || isSessionScoped}
                value={form.handoverDate}
                onChange={(e) =>
                  handleChange("handoverDate", e.target.value ?? "")
                }
              />
              {fieldErrors.handoverDate ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.handoverDate}
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  Usually the same date as the session the handover refers to.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="summary">Summary</Label>
            <textarea
              id="summary"
              disabled={submitting || isApproved}
              value={form.summary}
              onChange={(e) => handleChange("summary", e.target.value)}
              className="min-h-[80px] resize-y rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm leading-relaxed text-text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            />
            {fieldErrors.summary ? (
              <p className="text-xs text-status-danger">
                {fieldErrors.summary}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                A brief overview for incoming staff. Keep it concise but clear.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">
              Key notes{" "}
              <span className="text-xs text-text-muted">
                (one per line, optional)
              </span>
            </Label>
            <textarea
              id="notes"
              disabled={submitting || isApproved}
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="min-h-[120px] resize-y rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm leading-relaxed text-text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            />
            <p className="text-xs text-text-muted">
              Use bullet-style lines, e.g. “Bring inhalers”, “Watch for anxiety
              triggers”, “New child attending”.
            </p>
          </div>

          {form.children.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Per-child handover
              </h2>
              <p className="text-xs text-text-muted">
                One line per point for each child (e.g. tests completed, level
                changes, behaviour notes). Lines are shown as bullet points.
              </p>
              <div className="space-y-3">
                {form.children.map((child, idx) => (
                  <div
                    key={child.childId}
                    className="rounded-md border border-border-subtle bg-surface-alt px-3 py-3"
                  >
                    <Label
                      htmlFor={`childPoints-${child.childId}`}
                      className="text-sm font-medium text-text-primary"
                    >
                      {child.name}
                    </Label>
                    <textarea
                      id={`childPoints-${child.childId}`}
                      disabled={submitting || isApproved}
                      value={child.points}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          children: prev.children.map((c, i) =>
                            i === idx ? { ...c, points: e.target.value } : c,
                          ),
                        }))
                      }
                      placeholder={childPointsPlaceholder}
                      className="mt-2 min-h-[100px] w-full resize-y rounded-md border border-border-subtle bg-surface px-3 py-2 text-xs leading-relaxed text-text-primary shadow-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={submitting || isApproved}
              onClick={() => void handleSave(false)}
            >
              {submitting ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting || isApproved}
              onClick={() => void handleSave(true)}
            >
              {submitting ? "Submitting…" : "Submit for approval"}
            </Button>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}

