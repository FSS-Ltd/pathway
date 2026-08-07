import { useMutation, useQuery } from "@tanstack/react-query";

import * as billingApi from "../api/billing";

export function useEntitlements() {
  // GET /billing/entitlements is a household-config endpoint - a
  // non-admin's 401 is permanent, not worth the default 3 retries before
  // the permission-denied state can show (matches useOrgPeople's reasoning
  // in ../queries/org-people.ts).
  return useQuery({ queryKey: ["billing-entitlements"], queryFn: billingApi.getEntitlements, retry: false });
}

export function useCreateBillingPortalSession() {
  return useMutation({ mutationFn: billingApi.createBillingPortalSession });
}
