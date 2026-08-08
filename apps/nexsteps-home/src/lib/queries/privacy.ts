import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as privacyApi from "../api/privacy";
import type { DataExportKind } from "../api/privacy";

export function usePrivacyExports() {
  // GET /privacy/exports is a household-config endpoint - a non-admin's
  // 401 is permanent, not worth the default 3 retries before the
  // permission-denied state can show (matches useOrgPeople's reasoning in
  // ../queries/org-people.ts).
  return useQuery({ queryKey: ["privacy-exports"], queryFn: privacyApi.listExports, retry: false });
}

export function useRequestExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: DataExportKind) => privacyApi.requestExport(kind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["privacy-exports"] });
    },
  });
}

export function useRequestDeletion() {
  return useMutation({
    mutationFn: (reason?: string) => privacyApi.requestDeletion(reason),
  });
}
