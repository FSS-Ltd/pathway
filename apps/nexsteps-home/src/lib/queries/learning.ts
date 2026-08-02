import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { learningApi } from "@/lib/api";
import type { CreateReportBundleInput } from "@/lib/api/learning";

export function useLearningLogs() {
  return useQuery({ queryKey: ["learning-logs"], queryFn: learningApi.listLearningLogs });
}

export function useLearningLog(id: string | undefined) {
  return useQuery({
    queryKey: ["learning-logs", id],
    queryFn: () => learningApi.getLearningLog(id as string),
    enabled: Boolean(id),
  });
}

export function useEvidenceList() {
  return useQuery({ queryKey: ["evidence"], queryFn: learningApi.listEvidence });
}

export function useEvidenceItem(id: string | undefined) {
  return useQuery({
    queryKey: ["evidence", id],
    queryFn: () => learningApi.getEvidence(id as string),
    enabled: Boolean(id),
  });
}

export function useReportBundles() {
  return useQuery({ queryKey: ["report-bundles"], queryFn: learningApi.listReportBundles });
}

export function useReportBundle(id: string | undefined) {
  return useQuery({
    queryKey: ["report-bundles", id],
    queryFn: () => learningApi.getReportBundle(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateReportBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReportBundleInput) => learningApi.createReportBundle(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["report-bundles"] });
    },
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => learningApi.createSubject({ name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}
