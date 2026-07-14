"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import {
  AdminBillingOverview,
  AdminOrgOverview,
  AdminRetentionOverview,
  deactivateOrganisation,
  deleteOrgLogo,
  fetchActiveSiteState,
  fetchBillingOverview,
  fetchOrgOverview,
  fetchRetentionOverview,
  requestExportOrganisationData,
  updateOrgProfile,
  updateSiteProfile,
  uploadOrgLogo,
  ORG_SECTOR_LABELS,
  type ActiveSiteState,
  type SiteOption,
} from "../../lib/api-client";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canAccessAdminSection, canAccessBilling, canAccessSafeguardingAdmin } from "../../lib/access";
import type { AdminRoleInfo } from "../../lib/access";
import { canPerform } from "../../lib/permissions";
import { NoAccessCard } from "../../components/no-access-card";
import { QrCodeCard } from "../../components/qr/QrCodeCard";
import { getSafeDisplayName } from "../../lib/names";
import { ParentPortalSettingsCard } from "./parent-portal-settings-card";

function getRoleLabel(role: AdminRoleInfo): string {
  if (role.isOrgAdmin || role.isOrgOwner) return "Organisation admin";
  if (role.isSiteAdmin) return "Site admin";
  if (role.isSafeguardingStaff) return "Safeguarding lead";
  if (role.isStaff) return "Staff";
  return "Viewer";
}

export default function SettingsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [org, setOrg] = React.useState<AdminOrgOverview | null>(null);
  const [retention, setRetention] = React.useState<AdminRetentionOverview | null>(null);
  const [billing, setBilling] = React.useState<AdminBillingOverview | null>(null);
  const [siteState, setSiteState] = React.useState<ActiveSiteState | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editingOrg, setEditingOrg] = React.useState(false);
  const [editOrgName, setEditOrgName] = React.useState("");
  const [orgSaveError, setOrgSaveError] = React.useState<string | null>(null);
  const [savingOrg, setSavingOrg] = React.useState(false);
  const [parentPortalSaveError, setParentPortalSaveError] = React.useState<
    string | null
  >(null);
  const [savingParentPortal, setSavingParentPortal] = React.useState(false);

  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [savingLogo, setSavingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const [editingSite, setEditingSite] = React.useState(false);
  const [editSiteName, setEditSiteName] = React.useState("");
  const [editSiteTimezone, setEditSiteTimezone] = React.useState("");
  const [siteSaveError, setSiteSaveError] = React.useState<string | null>(null);
  const [savingSite, setSavingSite] = React.useState(false);

  const [exportLoading, setExportLoading] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = React.useState(false);
  const [deactivateLoading, setDeactivateLoading] = React.useState(false);
  const [deactivateError, setDeactivateError] = React.useState<string | null>(null);

  const [signupUrl, setSignupUrl] = React.useState("");

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orgData, retentionData, billingData, activeSiteData] = await Promise.all([
        fetchOrgOverview(),
        fetchRetentionOverview(),
        fetchBillingOverview(),
        fetchActiveSiteState(),
      ]);
      setOrg(orgData);
      setRetention(retentionData);
      setBilling(billingData);
      setSiteState(activeSiteData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load settings overview",
      );
      setOrg(null);
      setRetention(null);
      setBilling(null);
      setSiteState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (
      sessionStatus === "authenticated" &&
      session &&
      !isLoadingAccess &&
      canAccessAdminSection(role)
    ) {
      void load();
    }
  }, [sessionStatus, session, isLoadingAccess, role, load]);

  const canEditOrg = canPerform("settings:edit-org", role);
  const canEditSite = canPerform("settings:edit-site", role);
  const canManageBilling = canPerform("billing:access", role);
  const canAccessSafeguarding = canAccessSafeguardingAdmin(role);

  const currentSite: SiteOption | undefined = siteState?.activeSiteId
    ? siteState.sites.find((s) => s.id === siteState.activeSiteId)
    : undefined;

  const handleStartEditOrg = () => {
    setEditOrgName(org?.name ?? "");
    setOrgSaveError(null);
    setEditingOrg(true);
  };
  const handleCancelEditOrg = () => {
    setEditingOrg(false);
    setOrgSaveError(null);
  };
  const handleSaveOrg = async () => {
    setOrgSaveError(null);
    setSavingOrg(true);
    try {
      const updated = await updateOrgProfile({ name: editOrgName });
      setOrg(updated);
      setEditingOrg(false);
    } catch (e) {
      setOrgSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingOrg(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : "";
      if (!base64) return;
      setLogoError(null);
      setSavingLogo(true);
      try {
        const { logoUrl } = await uploadOrgLogo(base64, file.type);
        setOrg((prev) => (prev ? { ...prev, logoUrl } : prev));
      } catch (err) {
        setLogoError(err instanceof Error ? err.message : "Failed to upload logo");
      } finally {
        setSavingLogo(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveLogo = async () => {
    setLogoError(null);
    setSavingLogo(true);
    try {
      const { logoUrl } = await deleteOrgLogo();
      setOrg((prev) => (prev ? { ...prev, logoUrl } : prev));
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setSavingLogo(false);
    }
  };

  const handleToggleParentPortal = async (enabled: boolean) => {
    if (!org || enabled === org.parentPortalEnabled) return;
    setParentPortalSaveError(null);
    setSavingParentPortal(true);
    try {
      const updated = await updateOrgProfile({
        parentPortalEnabled: enabled,
      });
      setOrg(updated);
    } catch (e) {
      setParentPortalSaveError(
        e instanceof Error ? e.message : "Failed to save setting",
      );
    } finally {
      setSavingParentPortal(false);
    }
  };

  const handleStartEditSite = () => {
    setEditSiteName(currentSite?.name ?? "");
    setEditSiteTimezone(currentSite?.timezone ?? "");
    setSiteSaveError(null);
    setEditingSite(true);
  };
  const handleCancelEditSite = () => {
    setEditingSite(false);
    setSiteSaveError(null);
  };
  const handleSaveSite = async () => {
    if (!siteState?.activeSiteId) {
      setSiteSaveError("Select a site to edit site settings.");
      return;
    }
    setSiteSaveError(null);
    setSavingSite(true);
    try {
      const updated = await updateSiteProfile({
        siteId: siteState.activeSiteId,
        name: editSiteName,
        timezone: editSiteTimezone.trim() || undefined,
      });
      setSiteState((prev) =>
        prev
          ? {
              ...prev,
              sites: prev.sites.map((s) =>
                s.id === updated.id
                  ? { ...s, name: updated.name, timezone: updated.timezone }
                  : s,
              ),
            }
          : prev,
      );
      setEditingSite(false);
    } catch (e) {
      setSiteSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingSite(false);
    }
  };

  const handleExportOrganisationData = React.useCallback(async () => {
    setExportError(null);
    setExportLoading(true);
    try {
      const data = await requestExportOrganisationData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `organisation-export-${data.slug ?? "data"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }, []);

  const handleDeactivateConfirm = React.useCallback(async () => {
    setDeactivateError(null);
    setDeactivateLoading(true);
    try {
      await deactivateOrganisation();
      setDeactivateConfirmOpen(false);
    } catch (e) {
      setDeactivateError(e instanceof Error ? e.message : "Deactivation failed");
    } finally {
      setDeactivateLoading(false);
    }
  }, []);

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessAdminSection(role)) {
    return (
      <NoAccessCard
        title="You don't have access to settings"
        message="Organisation settings are only available to administrators."
      />
    );
  }

  const loadingBlock = (
    <div className="space-y-2">
      <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
      <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
      <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );

  const planTier = billing?.planCode ?? org?.planTier ?? null;
  const siteCount = org?.siteCount ?? billing?.maxSites ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Settings & Organisation
          </h1>
          <p className="text-sm text-text-muted">
            Organisation details, plan tier, and key data policies for this Nexsteps account.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Couldn&apos;t load settings.</span>
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* A) Organisation Profile */}
        <Card
          title="Organisation Profile"
          actions={
            canEditOrg && !editingOrg && org ? (
              <Button variant="secondary" size="sm" onClick={handleStartEditOrg}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {isLoading ? (
            loadingBlock
          ) : editingOrg ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organisation name</Label>
                <Input
                  id="org-name"
                  value={editOrgName}
                  onChange={(e) => setEditOrgName(e.target.value)}
                  placeholder="Organisation name"
                />
              </div>
              <p className="text-sm text-text-muted">Slug: {org?.slug ?? "—"} (read-only)</p>
              {org?.sector && (
                <p className="text-sm text-text-muted">
                  Sector: {ORG_SECTOR_LABELS[org.sector]} (read-only)
                </p>
              )}
              {orgSaveError && (
                <p className="text-sm text-status-danger">{orgSaveError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveOrg} disabled={savingOrg}>
                  {savingOrg ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCancelEditOrg}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : org ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-text-primary">{org.name}</p>
              <p className="text-sm text-text-muted">Slug: {org.slug ?? "Not configured"}</p>
              <p className="text-sm text-text-muted">
                {org.isMultiSite ? "Multi-site organisation" : "Single-site organisation"}
              </p>
              {org.sector && (
                <p className="text-sm text-text-muted">
                  Sector: {ORG_SECTOR_LABELS[org.sector]}
                </p>
              )}
              {planTier && (
                <p className="text-sm text-text-muted">Plan: {planTier}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Organisation information is not available.</p>
          )}
        </Card>

        {/* Logo: white-label branding shown in the admin shell day-to-day. */}
        <Card
          title="Logo"
          description="Shown in place of the Nexsteps mark across the admin app. Login and invite screens always show Nexsteps."
        >
          {isLoading ? (
            loadingBlock
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-surface">
                  {org?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={org.logoUrl}
                      alt="Organisation logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-text-muted">No logo</span>
                  )}
                </div>
                {canEditOrg && (
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={savingLogo}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {savingLogo ? "Saving…" : org?.logoUrl ? "Replace logo" : "Upload logo"}
                      </Button>
                      {org?.logoUrl && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={savingLogo}
                          onClick={handleRemoveLogo}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {logoError && (
                <p className="text-sm text-status-danger">{logoError}</p>
              )}
            </div>
          )}
        </Card>

        <ParentPortalSettingsCard
          enabled={org?.parentPortalEnabled ?? true}
          canEdit={canEditOrg}
          isLoading={isLoading}
          isSaving={savingParentPortal}
          error={parentPortalSaveError}
          onToggle={handleToggleParentPortal}
        />

        {/* A) Active Site */}
        <Card
          title="Active Site"
          actions={
            canEditSite && !editingSite && currentSite ? (
              <Button variant="secondary" size="sm" onClick={handleStartEditSite}>
                Edit
              </Button>
            ) : undefined
          }
        >
          {isLoading ? (
            loadingBlock
          ) : editingSite ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="site-name">Site name</Label>
                <Input
                  id="site-name"
                  value={editSiteName}
                  onChange={(e) => setEditSiteName(e.target.value)}
                  placeholder="Site name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-timezone">Timezone</Label>
                <Input
                  id="site-timezone"
                  value={editSiteTimezone}
                  onChange={(e) => setEditSiteTimezone(e.target.value)}
                  placeholder="e.g. Europe/London"
                />
              </div>
              {siteSaveError && (
                <p className="text-sm text-status-danger">{siteSaveError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveSite} disabled={savingSite}>
                  {savingSite ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCancelEditSite}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : currentSite ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-text-primary">{currentSite.name}</p>
              <p className="text-sm text-text-muted">
                Timezone: {currentSite.timezone ?? "Not configured in-app yet."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              Select a site from the header to see active site details.
            </p>
          )}
        </Card>

        {/* B) Sites & Plan */}
        <Card title="Sites & Plan">
          {isLoading ? (
            loadingBlock
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Plan</span>
                {planTier ? (
                  <Badge variant="secondary">{planTier}</Badge>
                ) : (
                  <span className="text-sm text-text-muted">Not available</span>
                )}
              </div>
              {siteCount != null && (
                <p className="text-sm text-text-muted">
                  {siteCount} {siteCount === 1 ? "site" : "sites"} on this plan.
                </p>
              )}
              {canManageBilling ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/billing">Manage plan</Link>
                </Button>
              ) : (
                <p className="text-sm text-text-muted">Contact your admin to change plan or billing.</p>
              )}
            </div>
          )}
        </Card>

        {/* C) Data Retention */}
        <Card title="Data Retention">
          {isLoading ? (
            loadingBlock
          ) : retention &&
            (retention.attendanceRetentionYears ||
              retention.safeguardingRetentionYears ||
              retention.notesRetentionYears) ? (
            <ul className="space-y-2 text-sm text-text-primary">
              {retention.attendanceRetentionYears != null && (
                <li>Attendance retained for {retention.attendanceRetentionYears} years.</li>
              )}
              {retention.safeguardingRetentionYears != null && (
                <li>
                  Safeguarding concerns retained for {retention.safeguardingRetentionYears} years.
                </li>
              )}
              {retention.notesRetentionYears != null && (
                <li>Notes retained for {retention.notesRetentionYears} years.</li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              Not configured in-app yet.
            </p>
          )}
        </Card>

        {/* Parent signup QR */}
        <Card
          title="Parent signup QR"
          description="Generate a QR code for parents to register for this site. This QR is site-specific."
        >
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Paste the signup URL below to generate a QR code. Parents can scan it to complete registration.
            </p>
            {/* TODO: replace with signed invite token from API (site-scoped, expiring). */}
            <div className="space-y-2">
              <Label htmlFor="signup-url">Signup URL</Label>
              <Input
                id="signup-url"
                value={signupUrl}
                onChange={(e) => setSignupUrl(e.target.value)}
                placeholder="https://example.com/signup?token=..."
              />
            </div>
            {signupUrl.trim() && (
              <QrCodeCard
                title="Parent signup"
                value={signupUrl.trim()}
                size={192}
                embedded
              />
            )}
          </div>
        </Card>

        {/* D) Team & Access */}
        <Card title="Team & Access">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/people">People & roles</Link>
              </Button>
              {canAccessSafeguarding && (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/safeguarding">Safeguarding access</Link>
                </Button>
              )}
            </div>
            {session?.user && (
              <div className="space-y-1 text-sm text-text-muted">
                <p>You are signed in as: {getSafeDisplayName(session.user)}</p>
                <p>Role: {getRoleLabel(role)}</p>
                <p>Active site: {currentSite?.name ?? "—"}</p>
              </div>
            )}
          </div>
        </Card>

        {/* E) Danger zone - ORG_ADMIN only */}
        {canManageBilling && (
          <Card title="Danger zone" className="md:col-span-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={exportLoading}
                  onClick={handleExportOrganisationData}
                >
                  {exportLoading ? "Preparing…" : "Export organisation data"}
                </Button>
                {!deactivateConfirmOpen ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeactivateError(null);
                      setDeactivateConfirmOpen(true);
                    }}
                  >
                    Deactivate organisation
                  </Button>
                ) : null}
              </div>
              {exportError && (
                <p className="text-sm text-status-danger">{exportError}</p>
              )}
              {deactivateConfirmOpen && (
                <div className="rounded-md border border-status-danger/30 bg-status-danger/5 p-4">
                  <p className="mb-2 font-semibold text-text-primary">
                    Are you sure you want to deactivate this organisation?
                  </p>
                  <p className="mb-4 text-sm text-text-muted">
                    This action may affect all sites and data. Confirm only if you understand the consequences.
                  </p>
                  {deactivateError && (
                    <p className="mb-3 text-sm text-status-danger">{deactivateError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deactivateLoading}
                      onClick={handleDeactivateConfirm}
                    >
                      {deactivateLoading ? "Deactivating…" : "Yes, deactivate organisation"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={deactivateLoading}
                      onClick={() => {
                        setDeactivateConfirmOpen(false);
                        setDeactivateError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
