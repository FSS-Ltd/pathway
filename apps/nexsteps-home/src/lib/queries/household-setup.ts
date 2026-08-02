import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { householdSetupApi } from "@/lib/api";
import type { WeekdayLabel } from "@/lib/api/household-setup";

export function useHouseholdSetupStatus() {
  return useQuery({
    queryKey: ["household-setup-status"],
    queryFn: () => householdSetupApi.getStatus(),
  });
}

export function useUpdateLearningDays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: WeekdayLabel[]) => householdSetupApi.updateLearningDays(days),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household-setup-status"] });
    },
  });
}

export function useCompleteSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => householdSetupApi.completeSetup(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["household-setup-status"] });
    },
  });
}
