"use client";

import * as React from "react";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";

export type PagedSiteQuery = { cursor?: string; signal?: AbortSignal };

export type PagedSitePage<T> = { items: T[]; nextCursor: string | null };

type PagedSiteState<T> = {
  items: T[];
  nextCursor: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
};

export type PagedSiteResults<T> = PagedSiteState<T> & {
  retry: () => void;
  loadMore: () => void;
};

type FetchPage<T> = (query: PagedSiteQuery) => Promise<PagedSitePage<T>>;

const emptyState = <T>(isLoading = false): PagedSiteState<T> => ({
  items: [],
  nextCursor: null,
  isLoading,
  isLoadingMore: false,
  error: null,
  loadMoreError: null,
});

export function useSitePagedResults<T>(
  fetchPage: FetchPage<T>,
  enabled: boolean,
  errorMessage: string,
): PagedSiteResults<T> {
  const [state, setState] = React.useState<PagedSiteState<T>>(() =>
    emptyState(enabled),
  );
  const [siteRevision, setSiteRevision] = React.useState(0);
  const generation = React.useRef(0);
  const controller = React.useRef<AbortController | null>(null);

  const invalidate = React.useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const reload = React.useCallback(async () => {
    invalidate();
    const requestGeneration = generation.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setState(emptyState(true));

    try {
      const page = await fetchPage({ signal: requestController.signal });
      if (requestGeneration !== generation.current) return;
      setState({
        ...emptyState<T>(),
        items: page.items,
        nextCursor: page.nextCursor,
      });
    } catch {
      if (requestGeneration !== generation.current) return;
      setState({ ...emptyState<T>(), error: errorMessage });
    } finally {
      if (requestGeneration === generation.current) controller.current = null;
    }
  }, [errorMessage, fetchPage, invalidate]);

  const loadMore = React.useCallback(async () => {
    if (!state.nextCursor || state.isLoading || state.isLoadingMore) return;
    const requestGeneration = generation.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setState((current) => ({
      ...current,
      isLoadingMore: true,
      loadMoreError: null,
    }));

    try {
      const page = await fetchPage({
        cursor: state.nextCursor,
        signal: requestController.signal,
      });
      if (requestGeneration !== generation.current) return;
      setState((current) => ({
        ...current,
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch {
      if (requestGeneration !== generation.current) return;
      setState((current) => ({
        ...current,
        isLoadingMore: false,
        loadMoreError: errorMessage,
      }));
    } finally {
      if (requestGeneration === generation.current) controller.current = null;
    }
  }, [
    errorMessage,
    fetchPage,
    state.isLoading,
    state.isLoadingMore,
    state.nextCursor,
  ]);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        invalidate();
        setState(emptyState(enabled));
        setSiteRevision((revision) => revision + 1);
      }),
    [enabled, invalidate],
  );

  React.useEffect(() => {
    if (!enabled) {
      invalidate();
      setState(emptyState());
      return;
    }
    void reload();
    return invalidate;
  }, [enabled, invalidate, reload, siteRevision]);

  return {
    ...state,
    retry: () => void reload(),
    loadMore: () => void loadMore(),
  };
}
