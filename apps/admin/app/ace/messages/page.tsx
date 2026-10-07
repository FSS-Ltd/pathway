"use client";

import React from "react";
import { StaffMessagingWorkspace } from "@/components/ace/messaging/staff-messaging-workspace";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

export default function AceMessagesPage() {
  const { data: session, status } = useSession();
  const access = useAdminAccess();

  if (status === "loading" || access.isLoading) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading messaging access…
      </p>
    );
  }
  if (
    status !== "authenticated" ||
    !session ||
    !access.userId ||
    !hasPermission(access.permissions, "messaging.conversations.read") ||
    !hasPermission(access.permissions, "messaging.messages.read")
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
      canSend={hasPermission(access.permissions, "messaging.messages.send")}
      canCreate={hasPermission(
        access.permissions,
        "messaging.conversations.create",
      )}
    />
  );
}
