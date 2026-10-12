"use client";

import * as React from "react";
import { fetchChildById, type AdminChildDetail } from "../../lib/api-client";

type LoadState = "loading" | "ready" | "missing" | "error";

export function useChildRecord(childId: string) {
  const [detail, setDetail] = React.useState<AdminChildDetail | null>(null);
  const [state, setState] = React.useState<LoadState>("loading");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const record = await fetchChildById(childId);
      setDetail(record);
      setState(record ? "ready" : "missing");
    } catch {
      setError("Unable to load this record. Please try again.");
      setState("error");
    }
  }, [childId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { detail, state, error, load };
}
