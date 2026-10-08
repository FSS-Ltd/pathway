"use client";

import React from "react";
import { DailyRegisterWorkspace } from "@/components/ace/attendance/daily-register-workspace";
import { NoAccessCard } from "@/components/no-access-card";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

export default function AceDailyAttendancePage() {
  const { data: session, status } = useSession();
  const { permissions, isLoading } = useAdminAccess();

  if (status === "loading" || isLoading) {
    return (
      <p className="text-sm text-text-muted" role="status">
        Loading daily register access…
      </p>
    );
  }
  if (
    status !== "authenticated" ||
    !session ||
    !permissions?.includes("attendance.read")
  ) {
    return (
      <NoAccessCard
        title="Daily register"
        message="You do not have permission to view daily attendance for this site."
      />
    );
  }

  return (
    <DailyRegisterWorkspace
      canManage={permissions.includes("attendance.manage")}
    />
  );
}
