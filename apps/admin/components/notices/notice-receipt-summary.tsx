"use client";

import * as React from "react";
import { Button, Card } from "@pathway/ui";
import {
  fetchNoticeReceiptSummary,
  type NoticeReceiptSummary as ReceiptTotals,
} from "@/lib/ace-notice-api";
import { requestFailure } from "@/lib/request-error";

export function NoticeReceiptSummary({ noticeId }: { noticeId: string }) {
  const [totals, setTotals] = React.useState<ReceiptTotals | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setTotals(null);
    void fetchNoticeReceiptSummary(noticeId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setTotals(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestFailure(cause, "Unable to load receipt totals.").message,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [noticeId, revision]);

  return (
    <Card title="Receipt totals">
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading receipt totals…
        </p>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : totals ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            These counts are from the recipient snapshot taken when the notice
            was published.
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border-subtle p-3">
              <dt className="text-xs text-text-muted">Delivered in app</dt>
              <dd className="mt-1 font-heading text-xl font-semibold text-text-primary">
                {totals.deliveredCount}{" "}
                <span className="text-sm font-normal text-text-muted">
                  / {totals.recipientCount}
                </span>
              </dd>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <dt className="text-xs text-text-muted">Read</dt>
              <dd className="mt-1 font-heading text-xl font-semibold text-text-primary">
                {totals.readCount}{" "}
                <span className="text-sm font-normal text-text-muted">
                  / {totals.recipientCount}
                </span>
              </dd>
            </div>
            {totals.requiresAcknowledgement ? (
              <div className="rounded-lg border border-border-subtle p-3">
                <dt className="text-xs text-text-muted">Acknowledged</dt>
                <dd className="mt-1 font-heading text-xl font-semibold text-text-primary">
                  {totals.acknowledgedCount}{" "}
                  <span className="text-sm font-normal text-text-muted">
                    / {totals.recipientCount}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh totals
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
