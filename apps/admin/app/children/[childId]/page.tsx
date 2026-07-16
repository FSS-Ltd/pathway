"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Download } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "@pathway/ui";
import { ProfileHeaderCard } from "../../../components/profile-header-card";
import { canAccessAdminSection, canAccessSafeguardingAdmin } from "../../../lib/access";
import { useAdminAccess } from "../../../lib/use-admin-access";
import {
  exportAttendanceCsv,
  fetchChildForEdit,
  fetchChildById,
  fetchGroups,
  inviteParentToChild,
  updateChild,
  uploadChildPhoto,
  type AdminChildGuardianContact,
  type ChildEditFormData,
  type UpdateChildPayload,
} from "../../../lib/api-client";
import { toLocalDateKey } from "../../../lib/date";
import { toast } from "sonner";

const statusTone: Record<string, "success" | "default"> = {
  active: "success",
  inactive: "default",
};

export default function ChildDetailPage() {
  const params = useParams<{ childId: string }>();
  const router = useRouter();
  const childId = params.childId;

  const [child, setChild] = React.useState<ChildEditFormData | null>(null);
  const [childDetail, setChildDetail] = React.useState<{
    fullName: string;
    hasPhotoConsent: boolean;
    ageGroupLabel: string | null;
    primaryGroupLabel: string | null;
    status: "active" | "inactive";
    hasAllergies: boolean;
    hasAdditionalNeeds: boolean;
    guardianContacts: AdminChildGuardianContact[];
  } | null>(null);
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [preferredName, setPreferredName] = React.useState("");
  const [allergies, setAllergies] = React.useState("");
  const [photoConsent, setPhotoConsent] = React.useState(false);
  const [groupId, setGroupId] = React.useState<string>("");
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<string, string>>
  >({});
  const [isUploadingPhoto, setIsUploadingPhoto] = React.useState(false);
  const [photoVersion, setPhotoVersion] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [addParentEmail, setAddParentEmail] = React.useState("");
  const [addParentName, setAddParentName] = React.useState("");
  const [addParentStatus, setAddParentStatus] = React.useState<
    "idle" | "inviting" | "success" | "error"
  >("idle");
  const [addParentError, setAddParentError] = React.useState<string | null>(
    null,
  );
  const [addParentSuccessMessage, setAddParentSuccessMessage] = React.useState<
    string | null
  >(null);
  const [exportFrom, setExportFrom] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalDateKey(d);
  });
  const [exportTo, setExportTo] = React.useState(() =>
    toLocalDateKey(new Date()),
  );
  const { data: session } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const isAdmin = canAccessAdminSection(role);
  const currentUserId = (session?.user as { id?: string })?.id ?? null;
  const guardianIds = child?.guardianIds ?? [];
  const canEdit =
    isAdmin || (!!currentUserId && guardianIds.includes(currentUserId));
  const isLinkedParent =
    !!currentUserId && guardianIds.includes(currentUserId);
  const canInviteParent =
    (role?.isOrgAdmin ?? false) || isLinkedParent;

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [childData, detailRes, groupsRes] = await Promise.all([
        fetchChildForEdit(childId),
        fetchChildById(childId),
        fetchGroups({ activeOnly: true }),
      ]);
      setChild(childData ?? null);
      if (childData) {
        setFirstName(childData.firstName ?? "");
        setLastName(childData.lastName ?? "");
        setPreferredName(childData.preferredName ?? "");
        setAllergies(childData.allergies ?? "");
        setPhotoConsent(childData.photoConsent ?? false);
        setGroupId(childData.groupId ?? "");
      }
      setChildDetail(
        detailRes
          ? {
              fullName: detailRes.fullName,
              hasPhotoConsent: detailRes.hasPhotoConsent,
              ageGroupLabel: detailRes.ageGroupLabel ?? null,
              primaryGroupLabel: detailRes.primaryGroupLabel ?? null,
              status: detailRes.status,
              hasAllergies: detailRes.hasAllergies,
              hasAdditionalNeeds: detailRes.hasAdditionalNeeds,
              guardianContacts: detailRes.guardianContacts,
            }
          : null,
      );
      setGroups(groupsRes);
      if (!childData) {
        setNotFound(true);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load child";
      if (message.includes("404")) {
        setNotFound(true);
      } else {
        setError(message);
      }
      setChild(null);
      setChildDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [childId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!child || !canEdit) return;
    setFieldErrors({});
    const nextErrors: Partial<Record<string, string>> = {};
    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload: UpdateChildPayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        preferredName: preferredName.trim() || null,
        allergies: allergies.trim() || "none",
        photoConsent,
        groupId: groupId || null,
      };
      await updateChild(childId, payload);
      await load();
      toast.success("Profile saved successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !child || !canEdit) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : "";
      if (!base64) return;
      setIsUploadingPhoto(true);
      setError(null);
      try {
        await uploadChildPhoto(childId, base64, file.type);
        setPhotoVersion((v) => v + 1);
        await load();
        toast.success("Photo updated successfully");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to upload photo",
        );
      } finally {
        setIsUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleInviteParent = async () => {
    const email = addParentEmail.trim();
    if (!email || !child || !canInviteParent) return;
    setAddParentStatus("inviting");
    setAddParentError(null);
    try {
      const result = await inviteParentToChild(childId, email, addParentName.trim() || undefined);
      if ("linked" in result && result.linked) {
        setAddParentStatus("success");
        setAddParentSuccessMessage("Parent linked successfully.");
        setAddParentEmail("");
        setAddParentName("");
        await load();
        toast.success("Parent linked successfully");
      } else if ("invited" in result && result.invited) {
        setAddParentStatus("success");
        setAddParentSuccessMessage(
          "Invite sent. They will receive an email to sign in or sign up, then they will have access to this child.",
        );
        setAddParentEmail("");
        setAddParentName("");
        await load();
        toast.success("Invite sent successfully");
      } else {
        setAddParentStatus("idle");
        setAddParentError("Could not complete invite. Please try again.");
      }
    } catch (err) {
      setAddParentStatus("error");
      setAddParentError(
        err instanceof Error ? err.message : "Failed to invite parent",
      );
    }
  };

  const renderFlag = (
    condition: boolean,
    label: string,
    positiveVariant: "success" | "warning" | "accent" | "default" = "success",
  ) => (
    <Badge variant={condition ? positiveVariant : "default"}>
      {condition ? label : `No ${label.toLowerCase()}`}
    </Badge>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/children" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to children
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {!isLoadingAccess && canAccessSafeguardingAdmin(role) ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/safeguarding">View in Safeguarding</Link>
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex flex-col items-center gap-4">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-4 w-40 animate-pulse rounded bg-muted" />
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Child Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find a child matching id <strong>{childId}</strong>.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => router.push("/children")}
            >
              Back to children
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Error Loading Child">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push("/children")}
            >
              Back to children
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : child && childDetail ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Profile
              </h1>
              <p className="mt-1 text-text-muted">
                Child details and overview
              </p>
            </div>
            {canEdit && (
              <Button
                size="sm"
                disabled={isSaving}
                onClick={handleSave}
              >
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <div className="border-t border-dashed border-border-subtle" aria-hidden />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProfileHeaderCard
              name={
                preferredName.trim() ||
                childDetail.fullName ||
                `${firstName} ${lastName}`.trim() ||
                "Unknown"
              }
              subtitle={
                childDetail.primaryGroupLabel ??
                childDetail.ageGroupLabel ??
                undefined
              }
              avatarSrc={
                `/api/children/${child.id}/photo?v=${photoVersion}`
              }
              badges={
                <Badge variant={statusTone[childDetail.status]}>
                  {childDetail.status === "active" ? "Active" : "Inactive"}
                </Badge>
              }
              showUploadButton={canEdit}
              onUploadClick={() => fileInputRef.current?.click()}
              isUploading={isUploadingPhoto}
              fileInputRef={fileInputRef}
              onFileChange={handlePhotoUpload}
              uploadHelpText="This helps volunteers identify children and mark attendance accurately. It is optional, so guests who may not return can be added without one. If this child attends regularly, please add a clear photo."
            />
            <Card className="p-6">
              <h2 className="text-lg font-bold text-text-primary">
                Bio & other details
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="child-firstName">First name *</Label>
                  <Input
                    id="child-firstName"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setFieldErrors((p) => ({ ...p, firstName: undefined }));
                    }}
                    className="mt-1"
                    disabled={!canEdit}
                  />
                  {fieldErrors.firstName ? (
                    <p className="mt-1 text-xs text-status-danger">
                      {fieldErrors.firstName}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="child-lastName">Last name *</Label>
                  <Input
                    id="child-lastName"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setFieldErrors((p) => ({ ...p, lastName: undefined }));
                    }}
                    className="mt-1"
                    disabled={!canEdit}
                  />
                  {fieldErrors.lastName ? (
                    <p className="mt-1 text-xs text-status-danger">
                      {fieldErrors.lastName}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="child-preferredName">Preferred name</Label>
                  <Input
                    id="child-preferredName"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="If different from first name"
                    className="mt-1"
                    disabled={!canEdit}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="child-allergies">
                    Allergies / key medical needs
                  </Label>
                  <Input
                    id="child-allergies"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="e.g. none, peanuts, asthma"
                    className="mt-1"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="child-photoConsent">
                    Organisation photo/video consent
                  </Label>
                  <Select
                    id="child-photoConsent"
                    value={photoConsent ? "yes" : "no"}
                    onChange={(e) =>
                      setPhotoConsent(e.target.value === "yes")
                    }
                    className="mt-1"
                    disabled={!canEdit}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                  <p className="mt-1 text-xs text-text-muted">
                    This controls photos or videos used outside the internal attendance profile.
                  </p>
                </div>
                <div>
                  <Label htmlFor="child-groupId">Primary group / class</Label>
                  <Select
                    id="child-groupId"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="mt-1"
                    disabled={!canEdit}
                  >
                    <option value="">Unassigned</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Card>
          </div>

          {canInviteParent && (
            <Card
              title="Invite parent"
              description="Add another parent or guardian. If they already have an account, they will be linked. Otherwise, they will receive an invite email to sign up."
            >
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="add-parent-email">Email *</Label>
                  <Input
                    id="add-parent-email"
                    type="email"
                    value={addParentEmail}
                    onChange={(e) => {
                      setAddParentEmail(e.target.value);
                      setAddParentStatus("idle");
                      setAddParentError(null);
                      setAddParentSuccessMessage(null);
                    }}
                    placeholder="e.g. partner@example.com"
                    className="mt-1"
                    disabled={addParentStatus === "inviting"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Label htmlFor="add-parent-name">Name (optional)</Label>
                  <Input
                    id="add-parent-name"
                    type="text"
                    value={addParentName}
                    onChange={(e) => setAddParentName(e.target.value)}
                    placeholder="For new users"
                    className="mt-1"
                    disabled={addParentStatus === "inviting"}
                  />
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleInviteParent}
                  disabled={
                    !addParentEmail.trim() || addParentStatus === "inviting"
                  }
                >
                  {addParentStatus === "inviting" ? "Inviting…" : "Invite parent"}
                </Button>
              </div>
              {addParentSuccessMessage && (
                <p className="mt-3 text-sm text-status-success">
                  {addParentSuccessMessage}
                </p>
              )}
              {addParentError && (
                <p className="mt-3 text-sm text-status-danger">
                  {addParentError}
                </p>
              )}
            </Card>
          )}

          {childDetail.guardianContacts.length > 0 ? (
            <Card title="Parent / guardian contacts">
              <div className="grid gap-3 md:grid-cols-2">
                {childDetail.guardianContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-md border border-border-subtle bg-surface-alt p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">
                        {contact.fullName}
                      </p>
                      <Badge variant="default">Record only</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-text-muted">
                      <p>
                        Relationship:{" "}
                        {contact.relationshipToChild ?? "Not provided"}
                      </p>
                      <p>Email: {contact.email ?? "Not provided"}</p>
                      <p>Phone: {contact.phone ?? "Not provided"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card title="Flags">
            <div className="flex flex-wrap gap-2 text-sm">
              {renderFlag(childDetail.hasAllergies, "Allergies", "warning")}
              {renderFlag(
                childDetail.hasAdditionalNeeds,
                "Additional needs",
                "accent",
              )}
              {renderFlag(
                childDetail.hasPhotoConsent,
                "Organisation photo/video consent",
                "success",
              )}
            </div>
            <p className="mt-3 text-sm text-text-muted">
              Profile pictures are internal attendance aids and do not depend on organisation photo/video consent.
            </p>
          </Card>

          {isAdmin && (
            <Card
              title="Export attendance record"
              description="Download this child's attendance for a date range."
            >
              <div className="flex min-w-0 flex-col flex-wrap gap-3 sm:flex-row sm:items-end sm:gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor="child-export-from">From</Label>
                  <div className="max-w-[10rem] overflow-hidden">
                    <Input
                      id="child-export-from"
                      type="date"
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className="w-full min-w-0"
                    />
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor="child-export-to">To</Label>
                  <div className="max-w-[10rem] overflow-hidden">
                    <Input
                      id="child-export-to"
                      type="date"
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      className="w-full min-w-0"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await exportAttendanceCsv({
                        scope: "child",
                        id: childId,
                        from: exportFrom,
                        to: exportTo,
                      });
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              </div>
            </Card>
          )}

          <Card title="Safeguarding">
            <p className="text-sm text-text-muted">
              Safeguarding view is available to authorised roles from the Safeguarding section. No safeguarding detail is shown here.
            </p>
            {!isLoadingAccess && canAccessSafeguardingAdmin(role) ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/safeguarding">View in Safeguarding</Link>
              </Button>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
