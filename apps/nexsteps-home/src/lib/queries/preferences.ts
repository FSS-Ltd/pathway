import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as preferencesApi from "../api/preferences";
import type { NotificationPreferences, PlanningPreferences } from "../api/preferences";

export function usePlanningPreferences() {
  return useQuery({
    queryKey: ["planning-preferences"],
    queryFn: preferencesApi.getPlanningPreferences,
  });
}

export function useUpdatePlanningPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<PlanningPreferences>) => preferencesApi.updatePlanningPreferences(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["planning-preferences"] });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn: preferencesApi.getNotificationPreferences,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NotificationPreferences>) =>
      preferencesApi.updateNotificationPreferences(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });
}
