"use client";

import { AceOverview } from "@/components/ace/overview/ace-overview";
import { useAceDashboard } from "@/components/ace/overview/use-ace-dashboard";
import { NoAccessCard } from "@/components/no-access-card";
import { useAdminAccess } from "@/lib/use-admin-access";

export default function AceOverviewPage() {
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canReadDashboard = permissions?.includes("ace.dashboard.read") === true;
  const dashboardState = useAceDashboard(!isLoadingAccess && canReadDashboard);

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
