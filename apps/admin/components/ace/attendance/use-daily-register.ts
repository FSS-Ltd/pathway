"use client";

import React from "react";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { toLocalDateKey } from "@/lib/date";
import {
  fetchDailyAttendance,
  type DailyAttendancePage,
} from "@/lib/daily-attendance-api";

function todayInTimeZone(timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: "year" | "month" | "day") =>
      parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function useDailyRegister() {
  const [date, setDate] = React.useState(() => toLocalDateKey(new Date()));
  const [bandId, setBandId] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [siteRevision, setSiteRevision] = React.useState(0);
  const [reloadRevision, setReloadRevision] = React.useState(0);
  const [data, setData] = React.useState<DailyAttendancePage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const userSelectedDate = React.useRef(false);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        userSelectedDate.current = false;
        setDate(toLocalDateKey(new Date()));
        setSiteRevision((current) => current + 1);
        setBandId("");
        setPage(1);
        setData(null);
        setError(null);
      }),
    [],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchDailyAttendance(
      { date, bandId: bandId || undefined, page },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const siteToday = result.timezone
          ? todayInTimeZone(result.timezone)
          : null;
        if (!userSelectedDate.current && siteToday && siteToday !== date) {
          setDate(siteToday);
          return;
        }
        setData(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the daily register.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, bandId, page, siteRevision, reloadRevision]);

  return {
    date,
    bandId,
    page,
    data,
    loading,
    error,
    siteRevision,
    chooseDate(value: string) {
      userSelectedDate.current = true;
      setDate(value);
      setPage(1);
      setData(null);
    },
    chooseBand(value: string) {
      setBandId(value);
      setPage(1);
      setData(null);
    },
    nextPage() {
      setPage((current) => current + 1);
      setData(null);
    },
    previousPage() {
      setPage((current) => Math.max(1, current - 1));
      setData(null);
    },
    retry() {
      setReloadRevision((current) => current + 1);
    },
  };
}
