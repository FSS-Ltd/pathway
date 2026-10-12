"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import {
  fetchBehaviourTrends,
  type AdminBehaviourTrendsQuery,
  type AdminBehaviourTrendsResponse,
} from "@/lib/api-client";
import { requestFailure } from "@/lib/request-error";
import { daysBefore, siteDate } from "./behaviour-date-range";

type Props = {
  active: boolean;
  canSensitive: boolean;
  siteTimeZone: string;
  refreshKey: number;
};

const controlClass =
  "min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function BehaviourTrends({
  active,
  canSensitive,
  siteTimeZone,
  refreshKey,
}: Props) {
  const today = React.useMemo(
    () => siteDate(new Date(), siteTimeZone),
    [siteTimeZone],
  );
  const [query, setQuery] = React.useState<AdminBehaviourTrendsQuery>(() => ({
    from: daysBefore(today, 29),
    to: today,
    bucket: "daily",
    visibility: "GENERAL",
  }));
  const [data, setData] = React.useState<AdminBehaviourTrendsResponse | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, retry] = React.useReducer((value) => value + 1, 0);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (canSensitive) return;
    setQuery((current) =>
      current.visibility === "GENERAL"
        ? current
        : { ...current, visibility: "GENERAL" },
    );
    setData(null);
  }, [canSensitive]);

  React.useEffect(() => {
    if (!active) return;
    let live = true;
    const request = ++requestId.current;
    setData(null);
    const daySpan =
      (Date.parse(`${query.to}T00:00:00Z`) -
        Date.parse(`${query.from}T00:00:00Z`)) /
      86_400_000;
    if (
      !query.from ||
      !query.to ||
      !Number.isFinite(daySpan) ||
      daySpan < 0 ||
      daySpan >= 366
    ) {
      setError("Choose a valid date range of at most 366 days.");
      setLoading(false);
      return () => {
        live = false;
      };
    }
    setError(null);
    setLoading(true);
    void fetchBehaviourTrends(query)
      .then((result) => {
        if (live && request === requestId.current) setData(result);
      })
      .catch((cause) => {
        if (live && request === requestId.current)
          setError(
            requestFailure(cause, "Unable to load behaviour trends.").message,
          );
      })
      .finally(() => {
        if (live && request === requestId.current) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [active, query, refreshKey, retryKey]);

  const change = <K extends keyof AdminBehaviourTrendsQuery>(
    key: K,
    value: AdminBehaviourTrendsQuery[K],
  ) => setQuery((current) => ({ ...current, [key]: value }));

  const maxCount = Math.max(
    1,
    ...(data?.items.map((item) => item.totalCount) ?? []),
  );

  return (
    <section aria-labelledby="behaviour-trends-title" className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="trend-from">From</Label>
          <input
            id="trend-from"
            className={controlClass}
            type="date"
            value={query.from}
            onChange={(event) => change("from", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="trend-to">To</Label>
          <input
            id="trend-to"
            className={controlClass}
            type="date"
            value={query.to}
            onChange={(event) => change("to", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="trend-bucket">Group by</Label>
          <select
            id="trend-bucket"
            className={controlClass}
            value={query.bucket}
            onChange={(event) =>
              change(
                "bucket",
                event.target.value as AdminBehaviourTrendsQuery["bucket"],
              )
            }
          >
            <option value="daily">Day</option>
            <option value="weekly">Week</option>
            <option value="monthly">Month</option>
          </select>
        </div>
        <div>
          <Label htmlFor="trend-visibility">Visibility</Label>
          <select
            id="trend-visibility"
            className={controlClass}
            value={query.visibility}
            onChange={(event) =>
              change(
                "visibility",
                event.target.value as AdminBehaviourTrendsQuery["visibility"],
              )
            }
          >
            <option value="GENERAL">General</option>
            {canSensitive ? <option value="SENSITIVE">Sensitive</option> : null}
            {canSensitive ? <option value="ALL">All</option> : null}
          </select>
        </div>
      </div>

      {loading ? (
        <p
          role="status"
          className="rounded-xl bg-muted p-4 text-sm text-text-muted"
        >
          Loading trends…
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-status-danger/30 bg-status-danger/5 p-4 text-sm text-status-danger"
        >
          {error}{" "}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => retry()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {data && !loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Entries" value={data.totals.totalCount} />
            <Metric label="Merit points" value={data.totals.meritPoints} />
            <Metric label="Demerit points" value={data.totals.demeritPoints} />
            <Metric label="Net points" value={data.totals.netPoints} />
          </div>
          {data.totals.totalCount === 0 ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-text-muted">
              No current behaviour records match this range.
            </p>
          ) : null}
          <div className="rounded-xl border border-border-subtle bg-surface p-4">
            <h2
              id="behaviour-trends-title"
              className="font-heading text-lg font-semibold text-text-primary"
            >
              Behaviour trends
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Entry count by{" "}
              {query.bucket === "daily"
                ? "day"
                : query.bucket === "weekly"
                  ? "week"
                  : "month"}
              . Values and points are listed below.
            </p>
            <div
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted"
              aria-hidden="true"
            >
              <span>
                <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-status-success" />
                Merit
              </span>
              <span>
                <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-status-danger" />
                Demerit
              </span>
              <span>
                <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                General
              </span>
            </div>
            <div
              role="img"
              aria-label={`Chart of ${data.totals.totalCount} behaviour entries across ${data.items.length} ${query.bucket} buckets`}
              className="mt-5 overflow-x-auto pb-2"
            >
              <div
                className="flex min-w-full items-end gap-2"
                style={{ width: `max(100%, ${data.items.length * 48}px)` }}
              >
                {data.items.map((item) => (
                  <div
                    key={item.bucketStart}
                    className="flex w-10 shrink-0 flex-col items-center gap-1 text-xs tabular-nums text-text-muted"
                  >
                    <span>{item.totalCount}</span>
                    <div className="flex h-32 w-full flex-col justify-end rounded-t bg-muted">
                      <div
                        className="flex w-full flex-col overflow-hidden rounded-t"
                        style={{
                          height: `${Math.max(0, (item.totalCount / maxCount) * 100)}%`,
                        }}
                      >
                        {item.totalCount > 0 ? (
                          <>
                            <div
                              className="bg-status-success"
                              style={{ flex: item.meritCount }}
                            />
                            <div
                              className="bg-status-danger"
                              style={{ flex: item.demeritCount }}
                            />
                            <div
                              className="bg-primary"
                              style={{ flex: item.generalCount }}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="w-full truncate text-center"
                      title={item.bucketStart}
                    >
                      {item.bucketStart.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <details className="mt-4 border-t border-border-subtle pt-3">
              <summary className="cursor-pointer text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                View accessible data summary
              </summary>
              <div className="mt-3 max-h-80 overflow-auto">
                <table className="w-full min-w-[32rem] text-left text-sm text-text-primary">
                  <caption className="sr-only">
                    Behaviour counts and point totals by {query.bucket} bucket
                  </caption>
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th scope="col" className="p-2">
                        Starting
                      </th>
                      <th scope="col" className="p-2">
                        Total
                      </th>
                      <th scope="col" className="p-2">
                        Merit
                      </th>
                      <th scope="col" className="p-2">
                        Demerit
                      </th>
                      <th scope="col" className="p-2">
                        General
                      </th>
                      <th scope="col" className="p-2">
                        Net points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.bucketStart}
                        className="border-b border-border-subtle"
                      >
                        <th scope="row" className="p-2 font-medium">
                          {item.bucketStart}
                        </th>
                        <td className="p-2 tabular-nums">{item.totalCount}</td>
                        <td className="p-2 tabular-nums">{item.meritCount}</td>
                        <td className="p-2 tabular-nums">
                          {item.demeritCount}
                        </td>
                        <td className="p-2 tabular-nums">
                          {item.generalCount}
                        </td>
                        <td className="p-2 tabular-nums">{item.netPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
