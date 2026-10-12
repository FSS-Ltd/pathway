"use client";

import React from "react";
import type { DataTablePageSize } from "@pathway/ui";
import { requestFailure } from "@/lib/request-error";

type CursorPage<T> = { items: T[]; nextCursor: string | null };
type FetchPage<T> = (params: {
  cursor?: string;
  limit: number;
}) => Promise<CursorPage<T>>;

export function useCursorPage<T>(
  fetchPage: FetchPage<T>,
  failureMessage: string,
  resetKey?: string | null,
) {
  const [items, setItems] = React.useState<T[]>([]);
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<DataTablePageSize>(10);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const previousResetKey = React.useRef(resetKey);

  React.useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setCursors([undefined]);
    setPageIndex(0);
    setReload((value) => value + 1);
  }, [resetKey]);

  const cursor = cursors[pageIndex];
  React.useEffect(() => {
    let current = true;
    setIsLoading(true);
    setError(null);
    void fetchPage({ cursor, limit: pageSize })
      .then((page) => {
        if (!current) return;
        if (page.items.length === 0 && pageIndex > 0) {
          setCursors((previous) => previous.slice(0, pageIndex));
          setPageIndex(pageIndex - 1);
          return;
        }
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((failure: unknown) => {
        if (current) setError(requestFailure(failure, failureMessage).message);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [cursor, pageSize, reload, fetchPage, failureMessage, pageIndex]);

  const changePage = (nextPage: number) => {
    if (nextPage === pageIndex - 1 && nextPage >= 0) {
      setPageIndex(nextPage);
    } else if (nextPage === pageIndex + 1 && nextCursor) {
      setCursors((previous) => [
        ...previous.slice(0, pageIndex + 1),
        nextCursor,
      ]);
      setPageIndex(nextPage);
    }
  };
  const changePageSize = (size: DataTablePageSize) => {
    setPageSize(size);
    setCursors([undefined]);
    setPageIndex(0);
  };

  return {
    items,
    pageIndex,
    pageSize,
    isLoading,
    error,
    hasNextPage: nextCursor !== null,
    changePage,
    changePageSize,
    refresh: () => setReload((value) => value + 1),
  };
}
