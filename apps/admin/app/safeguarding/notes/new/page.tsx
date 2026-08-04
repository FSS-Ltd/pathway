"use client";

// Create positive note: staff/safeguarding roles. Child + note text only.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Input } from "@pathway/ui";
import {
  AdminChildRow,
  fetchChildren,
  createNote,
  setApiClientToken,
} from "../../../../lib/api-client";
import { useAdminAccess } from "../../../../lib/use-admin-access";
import { canAccessSafeguardingAdmin } from "../../../../lib/access";
import { NoAccessCard } from "../../../../components/no-access-card";

export default function NewPositiveNotePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();

  const [children, setChildren] = React.useState<AdminChildRow[]>([]);
  const [childSearch, setChildSearch] = React.useState("");
  const [childId, setChildId] = React.useState("");
  const [text, setText] = React.useState("");
  const [isLoadingChildren, setIsLoadingChildren] = React.useState(true);
  const [childrenError, setChildrenError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const loadChildren = React.useCallback(async () => {
    setIsLoadingChildren(true);
    setChildrenError(null);
    try {
      const result = await fetchChildren();
      setChildren(result);
    } catch (err) {
      setChildrenError(
        err instanceof Error ? err.message : "Failed to load children",
      );
      setChildren([]);
    } finally {
      setIsLoadingChildren(false);
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
    void loadChildren();
  }, [sessionStatus, session, isLoadingAccess, role, loadChildren]);

  const filteredChildren = React.useMemo(() => {
    if (!childSearch.trim()) return children;
    const q = childSearch.trim().toLowerCase();
    return children.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [children, childSearch]);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const textTrimmed = text.trim();
      if (!childId || !textTrimmed) {
        setSubmitError("Please select a child and enter the note text.");
        return;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await createNote({ childId, text: textTrimmed });
        router.push("/safeguarding");
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to create note",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [childId, text, router],
  );

  const canSubmit = Boolean(childId && text.trim());

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
        title="You don't have access to create positive notes"
        message="Creating positive notes is only available to site admins, org admins, or safeguarding staff."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="secondary" size="sm">
        <Link href="/safeguarding" className="inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Safeguarding
        </Link>
      </Button>

      <Card>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Create positive note
          </h1>
          <p className="text-sm text-text-muted">
            Select a child and write a positive note. Notes are staff-only by
            default; visibility can be managed later.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="child-search"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Search children
              </label>
              <Input
                id="child-search"
                type="text"
                placeholder="Type to filter list…"
                value={childSearch}
                onChange={(e) => setChildSearch(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div>
              <label
                htmlFor="child-id"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Child <span className="text-status-danger">*</span>
              </label>
              {childrenError ? (
                <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">
                  {childrenError}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={loadChildren}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <select
                  id="child-id"
                  required
                  value={childId}
                  onChange={(e) => setChildId(e.target.value)}
                  className="h-10 w-full max-w-md rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary"
                >
                  <option value="">Select a child…</option>
                  {filteredChildren.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              )}
              {isLoadingChildren && (
                <p className="mt-1 text-xs text-text-muted">
                  Loading children…
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="note-text"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Note <span className="text-status-danger">*</span>
              </label>
              <textarea
                id="note-text"
                rows={4}
                required
                placeholder="e.g. Great participation in today's activity…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full max-w-md rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </div>

            {submitError && (
              <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">
                {submitError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Creating…" : "Create note"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/safeguarding")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
