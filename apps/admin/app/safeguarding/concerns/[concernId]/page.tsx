"use client";

// Concern detail: admin-only. Free-text (description) allowed here only; never in list.
// Do NOT expose reporter email/phone; use safe labels only.

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Card } from "@pathway/ui";
import {
  AdminConcernDetail,
  fetchConcernById,
  closeConcern,
  setApiClientToken,
} from "../../../../lib/api-client";
import { useAdminAccess } from "../../../../lib/use-admin-access";
import { canAccessSafeguardingAdmin } from "../../../../lib/access";
import { NoAccessCard } from "../../../../components/no-access-card";

const statusTone: Record<
  AdminConcernDetail["status"],
  "warning" | "accent" | "success" | "default"
> = {
  open: "warning",
  in_review: "accent",
  closed: "success",
  other: "default",
};

export default function ConcernDetailPage() {
  const params = useParams<{ concernId: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const concernId = params.concernId;

  const [detail, setDetail] = React.useState<AdminConcernDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [closeError, setCloseError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!concernId) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setCloseError(null);
    try {
      const result = await fetchConcernById(concernId);
      if (!result) {
        setNotFound(true);
        setDetail(null);
      } else {
        setDetail(result);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load concern",
      );
      setDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [concernId]);

  React.useEffect(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session ||
      isLoadingAccess ||
      !canAccessSafeguardingAdmin(role) ||
      !concernId
    ) {
      return;
    }
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
    void load();
  }, [sessionStatus, session, isLoadingAccess, role, concernId, load]);

  const handleClose = React.useCallback(async () => {
    if (!concernId || !detail) return;
    setIsClosing(true);
    setCloseError(null);
    try {
      await closeConcern(concernId);
      router.push("/safeguarding");
    } catch (err) {
      setCloseError(
        err instanceof Error ? err.message : "Failed to close concern",
      );
    } finally {
      setIsClosing(false);
    }
  }, [concernId, detail, router]);

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
        title="You don't have access to safeguarding details"
        message="Concern details are only available to site admins, org admins, or safeguarding leads."
      />
    );
  }

  if (sessionStatus === "loading" || (sessionStatus === "authenticated" && isLoading)) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-col gap-3">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/safeguarding" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Safeguarding
          </Link>
        </Button>
        <Card title="Concern not found">
          <p className="text-sm text-text-muted">
            We couldn't find a concern with that ID. It may have been closed or removed.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/safeguarding")}>
              Back to Safeguarding
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/safeguarding" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Safeguarding
          </Link>
        </Button>
        <Card title="Something went wrong">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/safeguarding")}>
              Back
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/safeguarding" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Safeguarding
          </Link>
        </Button>
        {detail.status !== "closed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleClose}
            disabled={isClosing}
          >
            {isClosing ? "Closing…" : "Close concern"}
          </Button>
        )}
      </div>

      {closeError && (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <p className="font-semibold">Close failed</p>
          <p className="text-xs text-text-muted">{closeError}</p>
          <Button size="sm" variant="secondary" onClick={handleClose} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary font-heading">
              Concern details
            </h1>
            <Badge variant={statusTone[detail.status]} className="capitalize">
              {detail.status.replace("_", " ")}
            </Badge>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Child</dt>
              <dd className="text-sm font-medium text-text-primary">
                {detail.childLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Category / Summary</dt>
              <dd className="text-sm text-text-primary">
                {detail.category ?? detail.summary ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Created</dt>
              <dd className="text-sm text-text-muted">
                {detail.createdAt
                  ? new Date(detail.createdAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Updated</dt>
              <dd className="text-sm text-text-muted">
                {detail.updatedAt
                  ? new Date(detail.updatedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>

          {detail.details && (
            <div>
              <dt className="text-xs text-text-muted mb-1 block">Description</dt>
              <dd className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
                {detail.details}
              </dd>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
