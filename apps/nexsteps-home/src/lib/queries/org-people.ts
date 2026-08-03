import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as orgPeopleApi from "../api/org-people";
import type { InviteAdultInput } from "../api/org-people";

export function useOrgPeople() {
  return useQuery({ queryKey: ["org-people"], queryFn: orgPeopleApi.listOrgPeople });
}

export function usePendingInvites() {
  return useQuery({ queryKey: ["org-invites"], queryFn: orgPeopleApi.listPendingInvites });
}

export function useInviteAdult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteAdultInput) => orgPeopleApi.inviteAdult(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-people"] });
      void queryClient.invalidateQueries({ queryKey: ["org-invites"] });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => orgPeopleApi.revokeInvite(inviteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-invites"] });
    },
  });
}

export function useRemovePersonAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => orgPeopleApi.removePersonAccess(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["org-people"] });
    },
  });
}
