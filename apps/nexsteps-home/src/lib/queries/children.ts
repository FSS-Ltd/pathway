import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { childrenApi } from "@/lib/api";
import type { CreateChildInput, UpdateChildInput } from "@/lib/api/children";

export function useChildren() {
  return useQuery({ queryKey: ["children"], queryFn: childrenApi.listChildren });
}

export function useChild(id: string) {
  return useQuery({
    queryKey: ["children", id],
    queryFn: () => childrenApi.getChild(id),
    enabled: Boolean(id),
  });
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

export function useUpdateChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChildInput }) =>
      childrenApi.updateChild(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["children"] });
      void queryClient.invalidateQueries({ queryKey: ["children", variables.id] });
    },
  });
}
