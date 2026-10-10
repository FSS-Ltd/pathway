"use client";

import * as React from "react";
import {
  fetchStaffNotice,
  fetchStaffNotices,
  markStaffNoticeRead,
  type ParentNoticeSummary,
} from "@/lib/ace-notice-api";
import { ApiError } from "@/lib/api-transport";
import { requestFailure } from "@/lib/request-error";

function errorMessage(error: unknown, fallback: string): string {
  return requestFailure(error, fallback).message;
}

export type NoticeSummary = ParentNoticeSummary & {
  audience?: "STAFF" | "PARENTS_AND_STAFF";
  historical?: boolean;
};
export type NoticeDetail = NoticeSummary & { body: string };
export type NoticePage = { items: NoticeSummary[]; nextCursor: string | null };
export type NoticeSource = {
  label: string;
  accessError?: string;
  list: (cursor?: string, signal?: AbortSignal) => Promise<NoticePage>;
  get: (id: string, signal?: AbortSignal) => Promise<NoticeDetail>;
  markRead: (id: string) => Promise<{ readAt: string }>;
};

const staffSource: NoticeSource = {
  label: "staff notices",
  list: fetchStaffNotices,
  get: fetchStaffNotice,
  markRead: markStaffNoticeRead,
};

export function useNoticeInbox(source: NoticeSource) {
  const [items, setItems] = React.useState<NoticeSummary[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<NoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [readPending, setReadPending] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [listRevision, setListRevision] = React.useState(0);
  const [detailRevision, setDetailRevision] = React.useState(0);
  const generation = React.useRef(0);
  const moreRequest = React.useRef<AbortController | null>(null);
  const selectedIdRef = React.useRef(selectedId);
  selectedIdRef.current = selectedId;

  React.useEffect(() => {
    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    moreRequest.current?.abort();
    setItems([]);
    setCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setListError(null);
    void source
      .list(undefined, controller.signal)
      .then((page) => {
        if (requestGeneration !== generation.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListError(
          error instanceof ApiError &&
            error.status === 404 &&
            source.accessError
            ? source.accessError
            : errorMessage(error, `Unable to load ${source.label}.`),
        );
      })
      .finally(() => {
        if (requestGeneration === generation.current) setLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
      moreRequest.current?.abort();
    };
  }, [source, listRevision]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setReadError(null);
    void source
      .get(selectedId, controller.signal)
      .then((notice) => {
        if (!controller.signal.aborted) setDetail(notice);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (error instanceof ApiError && [401, 403].includes(error.status)) {
            setItems([]);
            setCursor(null);
            setSelectedId(null);
            setListError(
              errorMessage(error, `Unable to load ${source.label}.`),
            );
          } else {
            setDetailError(
              errorMessage(
                error,
                "This notice is unavailable. It may have expired or been withdrawn.",
              ),
            );
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [source, selectedId, detailRevision]);

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return;
    const requestGeneration = generation.current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true);
    setListError(null);
    try {
      const page = await source.list(cursor, controller.signal);
      if (requestGeneration !== generation.current) return;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          setItems([]);
          setCursor(null);
          setSelectedId(null);
        }
        setListError(
          errorMessage(error, `Unable to load more ${source.label}.`),
        );
      }
    } finally {
      if (requestGeneration === generation.current) setLoadingMore(false);
    }
  }

  async function markRead(): Promise<void> {
    if (
      !selectedId ||
      !detail ||
      detail.historical ||
      detail.readAt ||
      readPending
    )
      return;
    const id = selectedId;
    setReadPending(true);
    setReadError(null);
    try {
      const result = await source.markRead(id);
      setDetail((current) =>
        current?.id === id ? { ...current, readAt: result.readAt } : current,
      );
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: result.readAt } : item,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        if (error.status !== 404) {
          setItems([]);
          setCursor(null);
          setListError(errorMessage(error, `Unable to load ${source.label}.`));
        }
        if (selectedIdRef.current === id) {
          setDetail(null);
          if (error.status === 404) {
            setDetailError(
              errorMessage(error, "This notice is no longer available."),
            );
          } else {
            setSelectedId(null);
          }
        }
        if (error.status === 404) {
          setItems((current) => current.filter((item) => item.id !== id));
        }
      } else {
        if (selectedIdRef.current === id) {
          setReadError(
            errorMessage(
              error,
              "Unable to mark this notice as read. Please retry.",
            ),
          );
        }
      }
    } finally {
      setReadPending(false);
    }
  }

  return {
    items,
    cursor,
    loading,
    loadingMore,
    listError,
    selectedId,
    detail,
    detailLoading,
    detailError,
    readPending,
    readError,
    select: setSelectedId,
    refresh: () => {
      setSelectedId(null);
      setListRevision((value) => value + 1);
    },
    retryDetail: () => setDetailRevision((value) => value + 1),
    loadMore,
    markRead,
  };
}

export function useStaffNotices() {
  return useNoticeInbox(staffSource);
}
