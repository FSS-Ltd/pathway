"use client";

import { AceOverview } from "@/components/ace/overview/ace-overview";
import { useAceDashboard } from "@/components/ace/overview/use-ace-dashboard";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

export default function AceOverviewPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canReadDashboard = hasPermission(permissions, "ace.dashboard.read");
  const dashboardState = useAceDashboard(
    sessionStatus === "authenticated" &&
      Boolean(session) &&
      !isLoadingAccess &&
      canReadDashboard,
  );

  if (isLoadingAccess) {
    return <AceOverview dashboard={null} isLoading />;
  }
  if (!canReadDashboard) {
    return (
      <NoAccessCard
        title="ACE overview"
        message="You do not have permission to view the ACE overview."
      />
    );
  }

  return <AceOverview {...dashboardState} />;
}
