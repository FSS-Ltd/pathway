"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Input, Label, Select } from "@pathway/ui";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  createInvite,
  fetchActiveSiteState,
  type CreateInvitePayload,
} from "../../../lib/api-client";
import { useAdminAccess } from "../../../lib/use-admin-access";
import { canAccessRoute } from "../../../lib/permissions";
import { NoAccessCard } from "../../../components/no-access-card";

const resolveOrgId = (activeSiteId: string | null, sites: Array<{ id: string; orgId: string }>) => {
  const activeSite = sites.find((site) => site.id === activeSiteId) ?? sites[0];
  return activeSite?.orgId ?? null;
};

const PRIMARY_HEX = "#0ec2a2";

function StyledRadio({
  id,
  name,
  label,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary"
    >
      <input
        id={id}
        name={name}
        type="radio"
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full border"
        style={{ borderColor: PRIMARY_HEX }}
      >
        <span
          className="flex h-2.5 w-2.5 items-center justify-center rounded-full transition-all peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
          style={{
            backgroundColor: checked ? PRIMARY_HEX : "white",
            outlineColor: PRIMARY_HEX,
          }}
        >
          {checked ? (
            <span className="block h-1.5 w-1.5 rounded-full bg-white" />
          ) : null}
        </span>
      </span>
      {label}
    </label>
  );
}

export default function InvitePersonPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/people/invite";
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [orgRole, setOrgRole] = React.useState<"ORG_ADMIN" | "ORG_MEMBER" | "">(
    "",
  );
  const [siteAccessMode, setSiteAccessMode] = React.useState<
    "NONE" | "ALL_SITES" | "SELECT_SITES"
  >("NONE");
  const [siteRole, setSiteRole] = React.useState<
    "SITE_ADMIN" | "STAFF" | "VIEWER" | ""
  >("");
  const [selectedSiteIds, setSelectedSiteIds] = React.useState<string[]>([]);
  const [sites, setSites] = React.useState<
    Array<{ id: string; name: string; orgId: string }>
  >([]);
  const [error, setError] = React.useState<string | null>(null);
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string;
    orgRole?: string;
    siteRole?: string;
    selectedSites?: string;
  }>({});
  const [submitting, setSubmitting] = React.useState(false);

  const canAccess = canAccessRoute(pathname, role);

  React.useEffect(() => {
    const loadOrg = async () => {
      try {
        const state = await fetchActiveSiteState();
        const resolvedOrgId = resolveOrgId(state.activeSiteId, state.sites);
        setOrgId(resolvedOrgId);
        setSites(state.sites);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load active site");
      }
    };
    void loadOrg();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nextErrors: typeof fieldErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email is required.";
    }

    if (!orgRole && siteAccessMode === "NONE") {
      nextErrors.orgRole = "Select at least an org role or site access.";
    }

    if (siteAccessMode !== "NONE" && !siteRole) {
      nextErrors.siteRole = "Site role is required when granting site access.";
    }

    if (siteAccessMode === "SELECT_SITES" && selectedSiteIds.length === 0) {
      nextErrors.selectedSites = "Select at least one site.";
    }

    if (!orgId) {
      nextErrors.orgRole = "Active organisation not found.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!orgId) {
      setError("Active organisation not found.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateInvitePayload = {
        email: email.trim(),
      };

      if (name.trim()) {
        payload.name = name.trim();
      }

      if (orgRole) {
        payload.orgRole = orgRole;
      }

      if (siteAccessMode !== "NONE" && siteRole) {
        payload.siteAccess = {
          mode: siteAccessMode as "ALL_SITES" | "SELECT_SITES",
          role: siteRole,
          siteIds:
            siteAccessMode === "SELECT_SITES" ? selectedSiteIds : undefined,
        };
      }

      await createInvite(orgId, payload);
      router.push("/people");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <NoAccessCard
        title="You don't have access to invite people"
        message="Inviting people is only available to organisation and site administrators."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push("/people")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to people
        </Button>
      </div>

      <Card
        title="Invite person"
        description="Send an invitation email to join your organisation."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="person@example.com"
              required
            />
            {fieldErrors.email ? (
              <p className="text-xs text-status-danger">{fieldErrors.email}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
            <p className="text-xs text-text-muted">
              Optional: The person's name will be used when they accept the invite.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgRole">Organisation role (optional)</Label>
              <Select
                id="orgRole"
                value={orgRole}
                onChange={(e) => {
                  setOrgRole(e.target.value as typeof orgRole);
                  setFieldErrors((prev) => ({ ...prev, orgRole: undefined }));
                }}
              >
                <option value="">None</option>
                <option value="ORG_ADMIN">Admin</option>
                <option value="ORG_MEMBER">Member</option>
              </Select>
              {fieldErrors.orgRole ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.orgRole}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Site access</Label>
              <div className="flex flex-col gap-2 text-sm text-text-primary">
                <StyledRadio
                  id="site-none"
                  name="siteAccess"
                  label="No site access"
                  checked={siteAccessMode === "NONE"}
                  onChange={() => setSiteAccessMode("NONE")}
                />
                <StyledRadio
                  id="site-all"
                  name="siteAccess"
                  label="All sites in this org"
                  checked={siteAccessMode === "ALL_SITES"}
                  onChange={() => setSiteAccessMode("ALL_SITES")}
                />
                <StyledRadio
                  id="site-select"
                  name="siteAccess"
                  label="Selected sites only"
                  checked={siteAccessMode === "SELECT_SITES"}
                  onChange={() => {
                    setSiteAccessMode("SELECT_SITES");
                    setFieldErrors((prev) => ({ ...prev, selectedSites: undefined }));
                  }}
                />
              </div>
            </div>
          </div>

          {siteAccessMode !== "NONE" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="siteRole">Site role</Label>
              <Select
                id="siteRole"
                value={siteRole}
                onChange={(e) => {
                  setSiteRole(e.target.value as typeof siteRole);
                  setFieldErrors((prev) => ({ ...prev, siteRole: undefined }));
                }}
              >
                <option value="">Select role</option>
                <option value="SITE_ADMIN">Site admin</option>
                <option value="STAFF">Staff</option>
                <option value="VIEWER">Viewer</option>
              </Select>
              {fieldErrors.siteRole ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.siteRole}
                </p>
              ) : null}
              {siteAccessMode === "SELECT_SITES" && (
                <div className="mt-2 flex flex-col gap-2">
                  <Label>Select sites</Label>
                  <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface p-3">
                    {(() => {
                      const orgSites = orgId
                        ? sites.filter((s) => s.orgId === orgId)
                        : sites;
                      return orgSites.length === 0 ? (
                        <p className="text-sm text-text-muted">
                          No sites available for this organisation.
                        </p>
                      ) : (
                        orgSites.map((site) => (
                          <label
                            key={site.id}
                            className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                          >
                            <Checkbox
                              checked={selectedSiteIds.includes(site.id)}
                              onChange={(e) => {
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  selectedSites: undefined,
                                }));
                                if (e.target.checked) {
                                  setSelectedSiteIds((prev) =>
                                    prev.includes(site.id) ? prev : [...prev, site.id],
                                  );
                                } else {
                                  setSelectedSiteIds((prev) =>
                                    prev.filter((id) => id !== site.id),
                                  );
                                }
                              }}
                            />
                            {site.name}
                          </label>
                        )));
                    })()}
                  </div>
                  {fieldErrors.selectedSites ? (
                    <p className="text-xs text-status-danger">
                      {fieldErrors.selectedSites}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/people")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending invite…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

