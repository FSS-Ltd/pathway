"use client";

import React from "react";
import {
  fetchFinanceStatementName,
  type FinanceStatementNameView,
} from "@/lib/finance-statement-name-client";

export function useStatementName() {
  const [value, setValue] = React.useState<FinanceStatementNameView | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef<AbortController | null>(null);
  const load = React.useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchFinanceStatementName(controller.signal);
      if (!controller.signal.aborted) setValue(next);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setValue(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "The name could not be checked with Stripe.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  return { value, loading, error, load };
}
