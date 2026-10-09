"use client";

import React from "react";
import { StaffMessagingWorkspace } from "@/components/ace/messaging/staff-messaging-workspace";
import { NoAccessCard } from "@/components/no-access-card";
import { useAdminContext } from "@/lib/admin-context";
import { useAdminAccess } from "@/lib/use-admin-access";

export default function AceMessagesPage() {
  const access = useAdminAccess();
  const { state } = useAdminContext();

  if (access.isLoading) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading messaging access…
      </p>
    );
  }
  if (
    !access.userId ||
    !access.permissions?.includes("messaging.conversations.read") ||
    !access.permissions.includes("messaging.messages.read")
  ) {
    return (
      <NoAccessCard
        title="Messages"
        message="You do not have permission to view staff conversations."
      />
    );
  }

  return (
    <StaffMessagingWorkspace
      key={access.userId}
      currentUserId={access.userId}
      canSend={access.permissions.includes("messaging.messages.send")}
      canCreate={access.permissions.includes("messaging.conversations.create")}
      familyMessagingEnabled={
        state.status === "ready" && state.snapshot.org.parentPortalEnabled
      }
    />
  );
}
