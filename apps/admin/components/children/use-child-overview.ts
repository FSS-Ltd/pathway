"use client";

import * as React from "react";
import {
  fetchStaffStudentOverview,
  type StudentOverviewResponse,
} from "../../lib/child-overview-api";

type OverviewLoad =
  | { state: "loading" }
  | { state: "ready"; overview: StudentOverviewResponse }
  | { state: "error"; message: string };

export function useChildOverview(childId: string) {
  const [load, setLoad] = React.useState<OverviewLoad>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchStaffStudentOverview(childId, controller.signal)
      .then((overview) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", overview });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Unable to load the overview. Please try again.",
        });
      });
    return () => controller.abort();
  }, [childId, revision]);

  return { load, refresh: () => setRevision((current) => current + 1) };
}
