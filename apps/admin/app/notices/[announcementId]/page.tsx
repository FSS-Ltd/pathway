"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import { cancelNoticeSchedule, withdrawNotice } from "@/lib/ace-notice-api";
import { requestFailure } from "@/lib/request-error";
import { useAdminContext } from "@/lib/admin-context";
import { useAdminAccess } from "@/lib/use-admin-access";
import { hasPermission } from "@/lib/access";
import { NoticeReceiptSummary } from "@/components/notices/notice-receipt-summary";
import {
  AdminAnnouncementDetail,
  fetchAnnouncementById,
} from "../../../lib/api-client";

const statusTone: Record<
  AdminAnnouncementDetail["status"],
  "default" | "accent" | "success" | "warning"
> = {
  draft: "default",
  scheduled: "accent",
  sent: "success",
  archived: "default",
  unknown: "warning",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function NoticeDetailContent() {
  const params = useParams<{ announcementId: string }>();
  const router = useRouter();
  const announcementId = params.announcementId;
  const { permissions } = useAdminAccess();
  const canPublish = hasPermission(permissions, "notices.publish");

  const [announcement, setAnnouncement] =
    React.useState<AdminAnnouncementDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [showWithdraw, setShowWithdraw] = React.useState(false);
  const [withdrawReason, setWithdrawReason] = React.useState("");
  const [withdrawPending, setWithdrawPending] = React.useState(false);
  const [withdrawError, setWithdrawError] = React.useState<string | null>(null);
  const [showCancelSchedule, setShowCancelSchedule] = React.useState(false);
  const [cancelPending, setCancelPending] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchAnnouncementById(announcementId);
      if (!result) {
        setNotFound(true);
        setAnnouncement(null);
      } else {
        setAnnouncement(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notice");
      setAnnouncement(null);
    } finally {
      setIsLoading(false);
    }
  }, [announcementId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submitWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    if (!withdrawReason.trim() || withdrawPending) return;
    setWithdrawPending(true);
    setWithdrawError(null);
    try {
      await withdrawNotice(announcementId, withdrawReason.trim());
      setShowWithdraw(false);
      setWithdrawReason("");
      await load();
    } catch (cause) {
      setWithdrawError(
        requestFailure(cause, "Unable to withdraw notice.").message,
      );
    } finally {
      setWithdrawPending(false);
    }
  }

  async function submitCancellation() {
    if (cancelPending) return;
    setCancelPending(true);
    setCancelError(null);
    try {
      await cancelNoticeSchedule(announcementId);
      setShowCancelSchedule(false);
      setCancelSuccess(true);
      await load();
    } catch (cause) {
      setCancelError(
        requestFailure(cause, "Unable to cancel this schedule.").message,
      );
    } finally {
      setCancelPending(false);
    }
  }

  const renderBody = (body: string | null) => {
    if (!body)
      return (
        <p className="text-sm text-text-muted">No message content available.</p>
      );
    return body.split("\n").map((para, idx) => (
      <p key={idx} className="text-sm text-text-primary">
        {para}
      </p>
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/notices" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to notices
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          {announcement?.status === "draft" &&
          !announcement.legacyImportedAt ? (
            <Button asChild size="sm">
              <Link href={`/notices/${announcementId}/edit`}>Edit draft</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Notice Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find an announcement with id{" "}
            <strong>{announcementId}</strong>.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/notices")}>
              Back to notices
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Something Went Wrong">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/notices")}>
              Back
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : announcement ? (
        <div className="flex flex-col gap-4">
          {cancelSuccess ? (
            <p role="status" className="text-sm text-status-success">
              Schedule cancelled. The notice is a draft again.
            </p>
          ) : null}
          <Card>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary font-heading">
                  {announcement.title}
                </h1>
                <Badge variant={statusTone[announcement.status] ?? "default"}>
                  {announcement.status}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                {announcement.audienceLabel ?? "Audience not specified"}
              </p>
            </div>
          </Card>

          <Card title="Message">{renderBody(announcement.body)}</Card>

          {announcement.legacyImportedAt ? (
            <Card>
              <p className="text-sm text-text-muted">
                Historical notice. Original author and delivery or read status
                were not recorded.
              </p>
            </Card>
          ) : null}

          {announcement.scheduleFailedAt ? (
            <Card title="Publication needs review">
              <p className="text-sm text-text-primary">
                This notice was not sent.{" "}
                {announcement.scheduleFailureReason ===
                "PUBLISHER_ACCESS_CHANGED"
                  ? "The scheduled publisher no longer has permission."
                  : "The eligible audience or expiry changed before publication."}{" "}
                Review the draft and its audience before sending it.
              </p>
            </Card>
          ) : null}

          <Card title="Publication">
            <div className="space-y-1 text-sm text-text-primary">
              <div>Created: {formatDateTime(announcement.createdAt)}</div>
              <div>Scheduled: {formatDateTime(announcement.scheduledAt)}</div>
              <div>Published: {formatDateTime(announcement.publishedAt)}</div>
              <div>Withdrawn: {formatDateTime(announcement.withdrawnAt)}</div>
            </div>
          </Card>

          <Card title="Audience">
            <p className="text-sm text-text-primary">
              {announcement.audienceLabel ?? "Audience unavailable"}
            </p>
          </Card>
          {announcement.status === "scheduled" &&
          !announcement.publishedAt &&
          !announcement.legacyImportedAt &&
          canPublish ? (
            <Card title="Cancel scheduled publication">
              <p className="text-sm text-text-muted">
                Cancellation returns this notice to a draft. You can edit or
                schedule it again afterward.
              </p>
              {showCancelSchedule ? (
                <div className="mt-3 space-y-3">
                  {cancelError ? (
                    <p role="alert" className="text-sm text-status-danger">
                      {cancelError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={cancelPending}
                      onClick={() => void submitCancellation()}
                    >
                      {cancelPending ? "Cancelling…" : "Confirm cancellation"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={cancelPending}
                      onClick={() => setShowCancelSchedule(false)}
                    >
                      Keep schedule
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setShowCancelSchedule(true)}
                >
                  Cancel schedule
                </Button>
              )}
            </Card>
          ) : null}
          {announcement.status === "sent" &&
          !announcement.legacyImportedAt &&
          canPublish ? (
            <NoticeReceiptSummary noticeId={announcementId} />
          ) : null}
          {announcement.status === "sent" && canPublish ? (
            <Card title="Withdraw notice">
              {showWithdraw ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => void submitWithdrawal(event)}
                >
                  <Label htmlFor="withdraw-reason">Reason for withdrawal</Label>
                  <Input
                    id="withdraw-reason"
                    required
                    maxLength={500}
                    value={withdrawReason}
                    onChange={(event) => setWithdrawReason(event.target.value)}
                  />
                  {withdrawError ? (
                    <p role="alert" className="text-sm text-status-danger">
                      {withdrawError}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={withdrawPending || !withdrawReason.trim()}
                    >
                      {withdrawPending ? "Withdrawing…" : "Confirm withdrawal"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowWithdraw(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowWithdraw(true)}
                >
                  Withdraw notice
                </Button>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function NoticeDetailPage() {
  const { state } = useAdminContext();
  if (state.status !== "ready") return null;
  return <NoticeDetailContent key={state.snapshot.activeSiteId} />;
}
