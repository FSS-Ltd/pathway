import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { childrenApi, familyPlannerApi, learningApi } from "@/lib/api";
import type {
  CreateActivityInput,
  CreateCalendarItemInput,
  CreateTaskInput,
} from "@/lib/api/family-planner";
import type { CreateChildInput } from "@/lib/api/children";
import type { CreateLearningLogInput } from "@/lib/api/learning";

export function useActivities() {
  return useQuery({ queryKey: ["activities"], queryFn: familyPlannerApi.listActivities });
}

export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: familyPlannerApi.listTasks });
}

export function useCalendarItems() {
  return useQuery({ queryKey: ["calendar-items"], queryFn: familyPlannerApi.listCalendarItems });
}

export function useChildren() {
  return useQuery({ queryKey: ["children"], queryFn: childrenApi.listChildren });
}

export function useCreateChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChildInput) => childrenApi.createChild(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["children"] });
    },
  });
}

export function useSubjects() {
  return useQuery({ queryKey: ["subjects"], queryFn: learningApi.listSubjects });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateActivityInput) => familyPlannerApi.createActivity(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => familyPlannerApi.createTask(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => familyPlannerApi.completeTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCreateCalendarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCalendarItemInput) => familyPlannerApi.createCalendarItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-items"] });
    },
  });
}

export function useCreateLearningLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLearningLogInput) => learningApi.createLearningLog(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["learning-logs"] });
    },
  });
}
