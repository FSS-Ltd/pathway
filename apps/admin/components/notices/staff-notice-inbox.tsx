"use client";

import * as React from "react";
import { ArrowLeft, MailOpen } from "lucide-react";
import { Button } from "@pathway/ui";
import {
  useStaffNotices,
  type NoticeDetail as NoticeDetailData,
  type NoticeSummary,
  type useNoticeInbox,
} from "./use-staff-notices";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function audienceLabel(audience: NoticeSummary["audience"]): string {
  if (!audience) return "School notice";
  return audience === "STAFF" ? "Staff" : "Parents and staff";
}

function receiptStatus(notice: NoticeSummary): string {
  if (notice.historical) return "Historical · read status unavailable";
  const read = notice.readAt ? "Read" : "Unread";
  if (!notice.requiresAcknowledgement) return read;
  return `${read} · ${notice.acknowledgedAt ? "Acknowledged" : "Acknowledgement needed"}`;
}

function NoticeDetail({
  notice,
  readPending,
  readError,
  onRead,
  ackPending,
  ackError,
  onAcknowledge,
}: {
  notice: NoticeDetailData;
  readPending: boolean;
  readError: string | null;
  onRead: () => void;
  ackPending: boolean;
  ackError: string | null;
  onAcknowledge: () => void;
}) {
  return (
    <article className="min-w-0 space-y-5 p-5 sm:p-7">
      <header className="border-b border-border-subtle pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
          {audienceLabel(notice.audience)}
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold leading-tight text-text-primary">
          {notice.title}
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Published {formatDate(notice.publishedAt)}
        </p>
      </header>
      <div className="whitespace-pre-wrap break-words text-sm leading-7 text-text-primary">
        {notice.body}
      </div>
      <footer className="border-t border-border-subtle pt-5">
        {notice.historical ? (
          <p className="text-sm text-text-muted">
            Historical notice · read status was not recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {notice.readAt ? (
              <p role="status" className="text-sm text-text-muted">
                Marked as read {formatDate(notice.readAt)}
              </p>
            ) : (
              <Button
                type="button"
                variant={
                  notice.requiresAcknowledgement ? "secondary" : "primary"
                }
                className="min-h-11"
                disabled={readPending || ackPending}
                onClick={onRead}
              >
                {readPending ? "Saving…" : "Mark as read"}
              </Button>
            )}
            {notice.requiresAcknowledgement ? (
              notice.acknowledgedAt ? (
                <p
                  role="status"
                  className="text-sm font-medium text-status-success"
                >
                  Acknowledged {formatDate(notice.acknowledgedAt)}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-text-muted">
                    The publisher has requested your acknowledgement.
                  </p>
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={ackPending || readPending}
                    onClick={onAcknowledge}
                  >
                    {ackPending ? "Saving…" : "Acknowledge notice"}
                  </Button>
                </div>
              )
            ) : null}
          </div>
        )}
        {readError ? (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {readError}
          </p>
        ) : null}
        {ackError ? (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {ackError}
          </p>
        ) : null}
      </footer>
    </article>
  );
}

export function NoticeInboxView({
  inbox,
  reader,
}: {
  inbox: ReturnType<typeof useNoticeInbox>;
  reader: "staff" | "parent";
}) {
  const isParent = reader === "parent";
  return (
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent-strong">
            {isParent ? "ACE / Family" : "Community"}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-text-primary sm:text-3xl">
            {isParent ? "School notices" : "Staff notices"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {isParent
              ? "Updates published for your family at this school."
              : "Published updates for staff at your active site."}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={inbox.refresh}
        >
          Refresh
        </Button>
      </header>

      <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card md:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]">
        <section
          aria-label={isParent ? "School notice list" : "Staff notice list"}
          className={`${inbox.selectedId ? "hidden md:block" : "block"} min-w-0 border-border-subtle md:border-r`}
        >
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Your notices
            </h2>
          </div>
          {inbox.loading ? (
            <p role="status" className="p-5 text-sm text-text-muted">
              Loading notices…
            </p>
          ) : null}
          {inbox.listError ? (
            <div className="space-y-3 p-5">
              <p role="alert" className="text-sm text-status-danger">
                {inbox.listError}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={
                  inbox.cursor ? () => void inbox.loadMore() : inbox.refresh
                }
              >
                Retry
              </Button>
            </div>
          ) : null}
          {!inbox.loading && !inbox.listError && inbox.items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <MailOpen
                className="mx-auto h-7 w-7 text-text-muted"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium text-text-primary">
                No current notices
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {isParent
                  ? "Published school notices for your family will appear here."
                  : "Published staff notices for this site will appear here."}
              </p>
            </div>
          ) : null}
          <ul className="divide-y divide-border-subtle">
            {inbox.items.map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  aria-pressed={inbox.selectedId === notice.id}
                  onClick={() => inbox.select(notice.id)}
                  className={`w-full px-5 py-4 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-strong ${inbox.selectedId === notice.id ? "bg-accent-subtle" : ""}`}
                >
                  <span className="block font-semibold text-text-primary">
                    {notice.title}
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {audienceLabel(notice.audience)} ·{" "}
                    {formatDate(notice.publishedAt)}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-accent-strong">
                    {receiptStatus(notice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {inbox.cursor ? (
            <div className="border-t border-border-subtle p-4 text-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                disabled={inbox.loadingMore}
                onClick={() => void inbox.loadMore()}
              >
                {inbox.loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </section>

        <section
          aria-label="Notice detail"
          className={`${inbox.selectedId ? "block" : "hidden md:block"} min-w-0 bg-shell/70`}
        >
          {inbox.selectedId ? (
            <div className="border-b border-border-subtle p-4 md:hidden">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inbox.select(null)}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to
                notices
              </Button>
            </div>
          ) : null}
          {inbox.detailLoading ? (
            <p role="status" className="p-6 text-sm text-text-muted">
              Loading notice…
            </p>
          ) : null}
          {inbox.detailError ? (
            <div className="space-y-3 p-6">
              <p role="alert" className="text-sm text-status-danger">
                {inbox.detailError}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={inbox.retryDetail}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {inbox.detail ? (
            <NoticeDetail
              notice={inbox.detail}
              readPending={inbox.readPending}
              readError={inbox.readError}
              onRead={() => void inbox.markRead()}
              ackPending={inbox.ackPending}
              ackError={inbox.ackError}
              onAcknowledge={() => void inbox.acknowledge()}
            />
          ) : null}
          {!inbox.selectedId ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center p-6 text-center">
              <MailOpen
                className="h-9 w-9 text-accent-strong"
                aria-hidden="true"
              />
              <h2 className="mt-4 font-heading text-xl font-semibold text-text-primary">
                Choose a notice
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Select a notice to read its full message.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export function StaffNoticeInbox() {
  const inbox = useStaffNotices();
  return <NoticeInboxView inbox={inbox} reader="staff" />;
}
