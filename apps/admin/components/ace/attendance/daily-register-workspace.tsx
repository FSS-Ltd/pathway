"use client";

import React from "react";
import { Button, Card, Input, Label, Select } from "@pathway/ui";
import type { DailyAttendanceRow } from "@/lib/daily-attendance-api";
import { DailyRegisterHistory } from "./daily-register-history";
import { DailyRegisterRow } from "./daily-register-row";
import { useDailyRegister } from "./use-daily-register";

export function DailyRegisterWorkspace({ canManage }: { canManage: boolean }) {
  const register = useDailyRegister();
  const [history, setHistory] = React.useState<{
    factId: string;
    childName: string;
  } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const historyTrigger = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    setHistory(null);
    setNotice(null);
  }, [register.date, register.bandId, register.siteRevision]);

  const dateIsOpen =
    register.data?.teachingDate?.kind === "TEACHING" ||
    register.data?.teachingDate?.kind === "EXCEPTIONAL_OPEN";
  const canWrite =
    dateIsOpen && Boolean(register.data?.timezone) && !register.error;

  function saved() {
    setNotice("Daily attendance updated for this site.");
    register.retry();
  }

  function showHistory(row: DailyAttendanceRow) {
    if (!row.mark) return;
    historyTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setHistory({ factId: row.mark.id, childName: row.displayName });
    requestAnimationFrame(() => {
      document
        .getElementById("daily-history")
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function closeHistory() {
    setHistory(null);
    requestAnimationFrame(() => {
      if (historyTrigger.current?.isConnected) historyTrigger.current.focus();
      historyTrigger.current = null;
    });
  }

  return (
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">
          ACE / Attendance
        </p>
        <h1 className="font-heading text-2xl font-semibold text-text-primary sm:text-3xl">
          Daily register
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Review enrolled students and record the school day for the active
          site.
        </p>
      </header>

      <Card
        title="Choose the school day"
        description="The date is interpreted in the active site's timezone."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="daily-register-date">Date</Label>
            <Input
              className="mt-1 min-h-11"
              id="daily-register-date"
              type="date"
              value={register.date}
              onChange={(event) => register.chooseDate(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="daily-register-band">Year band</Label>
            <Select
              className="mt-1 min-h-11"
              id="daily-register-band"
              value={register.bandId}
              onChange={(event) => register.chooseBand(event.target.value)}
            >
              <option value="">All permitted bands</option>
              {register.data?.permittedBands.map((band) => (
                <option key={band.id} value={band.id}>
                  {band.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {notice ? (
        <p
          className="rounded-xl bg-status-success/10 px-4 py-3 text-sm text-status-success"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {register.error ? (
        <div className="rounded-xl border border-status-danger/30 bg-status-danger/5 p-4">
          <p className="text-sm text-status-danger" role="alert">
            {register.error}
          </p>
          <Button
            className="mt-3 min-h-11"
            onClick={register.retry}
            type="button"
            variant="secondary"
          >
            Retry
          </Button>
        </div>
      ) : null}

      {register.loading && !register.data ? (
        <Card title="Students">
          <p className="text-sm text-text-muted" role="status">
            Loading the daily register…
          </p>
        </Card>
      ) : register.data ? (
        <>
          <Card
            title="Day overview"
            description={
              register.data.timezone
                ? `Site timezone: ${register.data.timezone}`
                : "Site timezone is not configured."
            }
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Present", register.data.counts.present],
                  ["Absent", register.data.counts.absent],
                  ["Late", register.data.counts.late],
                  ["Unmarked", register.data.counts.unmarked],
                ] as const
              ).map(([label, count]) => (
                <div
                  className="rounded-xl border border-border-subtle bg-surface px-4 py-3"
                  key={label}
                >
                  <p className="text-xs font-medium text-text-muted">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
                    {count}
                  </p>
                </div>
              ))}
            </div>
            {!dateIsOpen ? (
              <p className="mt-4 text-sm text-text-muted" role="status">
                {register.data.teachingDate
                  ? `This date is closed for marking${register.data.teachingDate.reason ? `: ${register.data.teachingDate.reason}` : "."}`
                  : "This date has not been configured for teaching. Marking is unavailable."}
              </p>
            ) : !register.data.timezone ? (
              <p className="mt-4 text-sm text-text-muted" role="status">
                Configure the site timezone before marking attendance.
              </p>
            ) : null}
          </Card>

          <section
            aria-labelledby="daily-students-heading"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  className="font-heading text-xl font-semibold text-text-primary"
                  id="daily-students-heading"
                >
                  Students
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  {register.data.total} enrolled · page {register.data.page}
                  {register.loading ? " · Updating…" : ""}
                </p>
              </div>
              {!canManage ? (
                <p className="text-sm text-text-muted">Read-only access</p>
              ) : null}
            </div>

            {register.data.items.length === 0 ? (
              <p
                className="rounded-xl border border-border-subtle bg-surface px-4 py-6 text-sm text-text-muted"
                role="status"
              >
                No enrolled students are available for this date and band.
              </p>
            ) : (
              <ul aria-label="Daily attendance students" className="space-y-3">
                {register.data.items.map((row) => (
                  <DailyRegisterRow
                    key={`${register.date}:${register.bandId}:${row.childId}`}
                    row={row}
                    date={register.date}
                    canManage={canManage}
                    canWrite={canWrite}
                    onSaved={saved}
                    onHistory={() => showHistory(row)}
                  />
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button
                className="min-h-11"
                disabled={register.page <= 1 || register.loading}
                onClick={register.previousPage}
                type="button"
                variant="secondary"
              >
                Previous
              </Button>
              <Button
                className="min-h-11"
                disabled={!register.data.nextPage || register.loading}
                onClick={register.nextPage}
                type="button"
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </section>
        </>
      ) : null}

      {history ? (
        <DailyRegisterHistory
          key={history.factId}
          factId={history.factId}
          childName={history.childName}
          onClose={closeHistory}
        />
      ) : null}
    </main>
  );
}
