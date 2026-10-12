"use client";

import React from "react";
import { Label } from "@pathway/ui";
import {
  correctBehaviour,
  fetchBehaviourHistory,
  retractBehaviour,
  type AdminBehaviourCategory,
  type AdminBehaviourEntry,
  type AdminBehaviourVisibility,
} from "@/lib/api-client";
import { requestFailure } from "@/lib/request-error";
import { BehaviourHistory } from "./behaviour-history";
import {
  daysBefore,
  historyDateBounds,
  siteDate,
} from "./behaviour-date-range";

type Props = {
  children: Array<{ id: string; fullName: string }>;
  categories: AdminBehaviourCategory[];
  canCorrect: boolean;
  canVoid: boolean;
  canSensitive: boolean;
  siteTimeZone: string;
  refreshKey: number;
  onChanged: () => Promise<void> | void;
};

const dateClass =
  "min-h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function BehaviourRecentWorkspace({
  children,
  categories,
  canCorrect,
  canVoid,
  canSensitive,
  siteTimeZone,
  refreshKey,
  onChanged,
}: Props) {
  const today = React.useMemo(
    () => siteDate(new Date(), siteTimeZone),
    [siteTimeZone],
  );
  const [from, setFrom] = React.useState(() => daysBefore(today, 6));
  const [to, setTo] = React.useState(today);
  const [visibility, setVisibility] = React.useState<
    AdminBehaviourVisibility | "ALL"
  >("GENERAL");
  const [cursors, setCursors] = React.useState<Array<string | undefined>>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [items, setItems] = React.useState<AdminBehaviourEntry[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [serverCanVoid, setServerCanVoid] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, retry] = React.useReducer((value) => value + 1, 0);
  const requestId = React.useRef(0);
  const lastRefreshKey = React.useRef(refreshKey);

  const resetPage = () => {
    setCursors((current) =>
      current.length === 1 && current[0] === undefined ? current : [undefined],
    );
    setPageIndex(0);
    setItems([]);
    setNextCursor(null);
  };

  React.useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    resetPage();
  }, [refreshKey]);

  React.useEffect(() => {
    let active = true;
    const request = ++requestId.current;
    const bounds = historyDateBounds(from, to, siteTimeZone);
    if (!bounds) {
      setError("Choose a valid date range with From on or before To.");
      setItems([]);
      setNextCursor(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    void fetchBehaviourHistory({
      ...bounds,
      visibility,
      limit: 10,
      cursor: cursors[pageIndex],
    })
      .then((result) => {
        if (!active || request !== requestId.current) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setServerCanVoid(result.canVoid === true);
      })
      .catch((cause) => {
        if (!active || request !== requestId.current) return;
        setError(
          requestFailure(cause, "Unable to load recent behaviour.").message,
        );
        setServerCanVoid(false);
      })
      .finally(() => {
        if (active && request === requestId.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    cursors,
    from,
    pageIndex,
    refreshKey,
    retryKey,
    siteTimeZone,
    to,
    visibility,
  ]);

  const changed = async () => {
    resetPage();
    retry();
    await onChanged();
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="history-from">From</Label>
          <input
            id="history-from"
            type="date"
            className={dateClass}
            value={from}
            onChange={(event) => {
              resetPage();
              setFrom(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="history-to">To</Label>
          <input
            id="history-to"
            type="date"
            className={dateClass}
            value={to}
            onChange={(event) => {
              resetPage();
              setTo(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="history-visibility">Visibility</Label>
          <select
            id="history-visibility"
            className={dateClass}
            value={visibility}
            onChange={(event) => {
              resetPage();
              setVisibility(
                event.target.value as AdminBehaviourVisibility | "ALL",
              );
            }}
          >
            <option value="GENERAL">General</option>
            {canSensitive ? <option value="SENSITIVE">Sensitive</option> : null}
            {canSensitive ? <option value="ALL">All authorised</option> : null}
          </select>
        </div>
      </div>
      <BehaviourHistory
        isLoading={loading}
        error={error}
        items={items}
        children={children}
        categories={categories}
        canCorrect={canCorrect}
        canVoid={canVoid && serverCanVoid}
        canSensitive={canSensitive}
        siteTimeZone={siteTimeZone}
        selectedVisibility={visibility}
        onRetry={() => retry()}
        onCorrect={correctBehaviour}
        onRetract={retractBehaviour}
        onSuccess={changed}
        pagination={{
          page: pageIndex + 1,
          hasNext: Boolean(nextCursor),
          onNext: () => {
            if (!nextCursor) return;
            setCursors((current) => [
              ...current.slice(0, pageIndex + 1),
              nextCursor,
            ]);
            setPageIndex((current) => current + 1);
          },
          onPrevious: () => setPageIndex((current) => Math.max(0, current - 1)),
        }}
      />
    </div>
  );
}
