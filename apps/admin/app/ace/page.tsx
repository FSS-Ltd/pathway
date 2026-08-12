"use client";

import React from "react";
import { AceOverview } from "@/components/ace/overview/ace-overview";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import { fetchAceDashboard, type AceDashboardResponse } from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

export default function AceOverviewPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canReadDashboard = hasPermission(permissions, "ace.dashboard.read");
  const [dashboard, setDashboard] = React.useState<AceDashboardResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setDashboard(await fetchAceDashboard());
    } catch {
      setDashboard(null);
      setError("Unable to load the ACE overview.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session ||
      isLoadingAccess ||
      !canReadDashboard
    ) {
      return;
    }
    void load();
  }, [canReadDashboard, isLoadingAccess, load, session, sessionStatus]);

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

  return (
    <AceOverview
      dashboard={dashboard}
      isLoading={isLoading}
      error={error}
      onRetry={() => void load()}
    />
  );
}
