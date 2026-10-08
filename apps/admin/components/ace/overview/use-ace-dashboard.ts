"use client";

import * as React from "react";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { fetchAceDashboard, type AceDashboardResponse } from "@/lib/api-client";
import { requestFailure } from "@/lib/request-error";

export type UseAceDashboardResult = {
  dashboard: AceDashboardResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function useAceDashboard(enabled: boolean): UseAceDashboardResult {
  const [dashboard, setDashboard] = React.useState<AceDashboardResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(enabled);
  const [error, setError] = React.useState<string | null>(null);
  const [activeSiteRevision, setActiveSiteRevision] = React.useState(0);
  const requestGeneration = React.useRef(0);
  const activeController = React.useRef<AbortController | null>(null);

  const invalidateActiveRequest = React.useCallback(() => {
    requestGeneration.current += 1;
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  const load = React.useCallback(async () => {
    invalidateActiveRequest();
    const generation = requestGeneration.current;
    const controller = new AbortController();
    activeController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const nextDashboard = await fetchAceDashboard({
        signal: controller.signal,
      });
      if (
        generation !== requestGeneration.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setDashboard(nextDashboard);
    } catch (cause) {
      if (
        generation !== requestGeneration.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setDashboard(null);
      setError(
        requestFailure(cause, "Unable to load the ACE overview.").message,
      );
    } finally {
      if (generation === requestGeneration.current) {
        activeController.current = null;
        setIsLoading(false);
      }
    }
  }, [invalidateActiveRequest]);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        invalidateActiveRequest();
        setDashboard(null);
        setError(null);
        setIsLoading(true);
        setActiveSiteRevision((revision) => revision + 1);
      }),
    [invalidateActiveRequest],
  );

  React.useEffect(() => {
    if (!enabled) {
      invalidateActiveRequest();
      setDashboard(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    void load();
    return invalidateActiveRequest;
  }, [activeSiteRevision, enabled, invalidateActiveRequest, load]);

  return {
    dashboard,
    isLoading,
    error,
    onRetry: () => void load(),
  };
}
