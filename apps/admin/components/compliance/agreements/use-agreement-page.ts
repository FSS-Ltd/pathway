"use client";
import React from "react";
export function useAgreementPage<T>(
  load: (
    signal: AbortSignal,
    cursor?: string,
  ) => Promise<{ items: T[]; nextCursor: string | null }>,
) {
  const [items, setItems] = React.useState<T[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState("");
  const controller = React.useRef<AbortController | null>(null);
  const refresh = React.useCallback(
    async (next?: string) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setError("");
      try {
        const result = await load(current.signal, next);
        if (!current.signal.aborted) {
          setItems((previous) =>
            next ? [...previous, ...result.items] : result.items,
          );
          setCursor(result.nextCursor);
        }
      } catch {
        if (!current.signal.aborted)
          setError(
            "Records could not be loaded. Displayed information may be out of date. Retry to refresh.",
          );
      } finally {
        if (!current.signal.aborted) setBusy(false);
      }
    },
    [load],
  );
  React.useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  return { items, setItems, cursor, busy, error, refresh };
}
