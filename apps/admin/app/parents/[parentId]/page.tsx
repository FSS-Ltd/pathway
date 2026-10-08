"use client";

import React from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, User } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@pathway/ui";
import { Checkbox } from "../../../components/ui/checkbox";
import { ProfileHeaderCard } from "../../../components/profile-header-card";
import { GuardianAccessReviewCard } from "../../../components/parents/guardian-access-review-card";
import { canAccessSafeguardingAdmin } from "../../../lib/access";
import { useAdminAccess } from "../../../lib/use-admin-access";
import {
  AdminParentDetail,
  fetchParentById,
  updateParent,
  createChild,
  type UpdateParentPayload,
} from "../../../lib/api-client";
import { toast } from "sonner";

const statusTone: Record<string, "success" | "default"> = {
  active: "success",
  inactive: "default",
  archived: "default",
};

export default function ParentDetailPage() {
  const params = useParams<{ parentId: string }>();
  const router = useRouter();
  const parentId = params.parentId;

  const [parent, setParent] = React.useState<AdminParentDetail | null>(null);
  const [children, setChildren] = React.useState<
    { id: string; fullName: string }[]
  >([]);
  const [displayName, setDisplayName] = React.useState("");
  const [childIds, setChildIds] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<string, string>>
  >({});
  const [addChildModalOpen, setAddChildModalOpen] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [childForm, setChildForm] = React.useState({
    firstName: "",
    lastName: "",
    preferredName: "",
    dateOfBirth: "",
    allergies: "",
    additionalNeedsNotes: "",
    schoolName: "",
    yearGroup: "",
    gpName: "",
    gpPhone: "",
    specialNeedsType: "none" as "none" | "sen_support" | "ehcp" | "other",
    specialNeedsOther: "",
    photoConsent: false,
    photoBase64: "",
    photoContentType: "",
    pickupPermissions: "",
  });
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const canAddChildren = role.isOrgAdmin;

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const parentResult = await fetchParentById(parentId);
      setParent(parentResult);
      if (!parentResult) {
        setNotFound(true);
      } else {
        setDisplayName(parentResult.fullName ?? "");
        setChildIds(parentResult.children?.map((c) => c.id) ?? []);
      }
      setChildren(parentResult?.children ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load parent";
      if (message.includes("404")) {
        setNotFound(true);
      } else {
        setError(message);
      }
      setParent(null);
    } finally {
      setIsLoading(false);
    }
  }, [parentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!parent) return;
    setFieldErrors({});
    const nextErrors: Partial<Record<string, string>> = {};
    if (!displayName.trim()) {
      nextErrors.displayName = "Display name is required.";
    }
    if (displayName.trim().includes("@")) {
      nextErrors.displayName = "Do not use email as display name.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload: UpdateParentPayload = {
        displayName: displayName.trim(),
      };
      const updated = await updateParent(parentId, payload);
      if (updated) setParent(updated);
      toast.success("Profile saved successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const defaultChildForm = () => ({
    firstName: "",
    lastName: "",
    preferredName: "",
    dateOfBirth: "",
    allergies: "",
    additionalNeedsNotes: "",
    schoolName: "",
    yearGroup: "",
    gpName: "",
    gpPhone: "",
    specialNeedsType: "none" as const,
    specialNeedsOther: "",
    photoConsent: false,
    photoBase64: "",
    photoContentType: "",
    pickupPermissions: "",
  });

  const handleOpenAddChild = () => {
    setChildForm(defaultChildForm());
    setAddChildModalOpen(true);
  };

  const updateChildForm = (updates: Partial<typeof childForm>) => {
    setChildForm((p) => ({ ...p, ...updates }));
  };

  const handleCreateChild = async () => {
    const { firstName, lastName } = childForm;
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const { id } = await createChild({
        ...childForm,
        guardianIds: [parentId],
      });
      const updated = await fetchParentById(parentId);
      if (updated) {
        setParent(updated);
        setChildIds(updated.children?.map((c) => c.id) ?? [...childIds, id]);
      }
      setChildren((prev) => {
        const name = `${firstName.trim()} ${lastName.trim()}`.trim();
        return [...prev, { id, fullName: name || "Child" }];
      });
      setAddChildModalOpen(false);
      toast.success("Child added successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create child",
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/parents" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to parents
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
        <Card title="Parent Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find a parent matching id <strong>{parentId}</strong>.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/parents")}>
              Back to parents
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Error Loading Parent">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/parents")}>
              Back to parents
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : parent ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Profile
              </h1>
              <p className="mt-1 text-text-muted">
                Parent details and linked children
              </p>
            </div>
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <div className="border-t border-dashed border-border-subtle" aria-hidden />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProfileHeaderCard
              name={displayName.trim() || parent.fullName}
              subtitle={
                typeof parent.childrenCount === "number"
                  ? parent.childrenCount === 1
                    ? "1 linked child"
                    : `${parent.childrenCount} linked children`
                  : undefined
              }
              badges={
                <>
                  <Badge variant={statusTone[parent.status]}>
                    {parent.status === "active"
                      ? "Active"
                      : parent.status === "archived"
                        ? "Archived"
                        : "Inactive"}
                  </Badge>
                  {parent.isPrimaryContact ? (
                    <Badge variant="accent">Primary contact</Badge>
                  ) : null}
                </>
              }
            />
            <Card className="p-6">
              <h2 className="text-lg font-bold text-text-primary">
                Bio & contact
              </h2>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="parent-displayName">Display name *</Label>
                  <Input
                    id="parent-displayName"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setFieldErrors((p) => ({ ...p, displayName: undefined }));
                    }}
                    placeholder="e.g. Jane Smith"
                    className="mt-1"
                  />
                  {fieldErrors.displayName ? (
                    <p className="mt-1 text-xs text-status-danger">
                      {fieldErrors.displayName}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-text-muted">
                    Email: {parent.email ?? "—"} (not editable here)
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Linked Children"
            description="Children linked to this parent."
            actions={
              canAddChildren ? (
                <Button
                  size="sm"
                  onClick={handleOpenAddChild}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add child
                </Button>
              ) : undefined
            }
          >
            {childIds.length === 0 ? (
              <p className="text-sm text-text-muted">No linked children.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {childIds
                  .map((id) => children.find((c) => c.id === id))
                  .filter((c): c is { id: string; fullName: string } => !!c)
                  .map((child) => (
                    <li
                      key={child.id}
                      className="flex items-center justify-between rounded border border-border-subtle px-3 py-2"
                    >
                      <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                        <User className="h-4 w-4 text-text-muted" />
                        {child.fullName}
                      </span>
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/children/${child.id}`}>View profile</Link>
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-text-muted">
              Child links respect role and tenant access.
            </p>
          </Card>

          {!isLoadingAccess && role.isOrgAdmin ? (
            <GuardianAccessReviewCard key={parentId} parentId={parentId} />
          ) : null}

          {addChildModalOpen &&
            typeof document !== "undefined" &&
            ReactDOM.createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-child-modal-title"
                onClick={() => setAddChildModalOpen(false)}
              >
                <div
                  className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border-subtle bg-surface shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                <div className="flex-shrink-0 border-b border-border-subtle px-6 py-4">
                  <h2
                    id="add-child-modal-title"
                    className="text-lg font-semibold text-text-primary font-heading"
                  >
                    Add child
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Enter the child&apos;s details. Same fields as parent signup.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="child-firstName">First name *</Label>
                      <Input
                        id="child-firstName"
                        value={childForm.firstName}
                        onChange={(e) =>
                          updateChildForm({ firstName: e.target.value })
                        }
                        placeholder="e.g. Amara"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="child-lastName">Last name *</Label>
                      <Input
                        id="child-lastName"
                        value={childForm.lastName}
                        onChange={(e) =>
                          updateChildForm({ lastName: e.target.value })
                        }
                        placeholder="e.g. Smith"
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-preferredName">Preferred name</Label>
                      <Input
                        id="child-preferredName"
                        value={childForm.preferredName}
                        onChange={(e) =>
                          updateChildForm({ preferredName: e.target.value })
                        }
                        placeholder="If different from first name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="child-dateOfBirth">Date of birth *</Label>
                      <Input
                        id="child-dateOfBirth"
                        type="date"
                        value={childForm.dateOfBirth}
                        onChange={(e) =>
                          updateChildForm({ dateOfBirth: e.target.value })
                        }
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-allergies">
                        Allergies or key medical needs
                      </Label>
                      <Input
                        id="child-allergies"
                        value={childForm.allergies}
                        onChange={(e) =>
                          updateChildForm({ allergies: e.target.value })
                        }
                        placeholder="e.g. none, or list allergies / conditions we should know"
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <h3 className="mb-2 text-base font-medium text-text-primary">
                        Educational &amp; Medical Information
                      </h3>
                      <p className="mb-3 text-sm text-text-muted">
                        This helps us support your child appropriately. All
                        information is confidential.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-schoolName">
                        School / Nursery name
                      </Label>
                      <Input
                        id="child-schoolName"
                        value={childForm.schoolName}
                        onChange={(e) =>
                          updateChildForm({ schoolName: e.target.value })
                        }
                        placeholder="e.g. Oak Primary School"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="child-yearGroup">Year group</Label>
                      <Input
                        id="child-yearGroup"
                        value={childForm.yearGroup}
                        onChange={(e) =>
                          updateChildForm({ yearGroup: e.target.value })
                        }
                        placeholder="e.g. Reception, Year 3"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="child-gpName">GP name</Label>
                      <Input
                        id="child-gpName"
                        value={childForm.gpName}
                        onChange={(e) =>
                          updateChildForm({ gpName: e.target.value })
                        }
                        placeholder="Doctor or practice name"
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-gpPhone">GP phone number</Label>
                      <Input
                        id="child-gpPhone"
                        type="tel"
                        value={childForm.gpPhone}
                        onChange={(e) =>
                          updateChildForm({ gpPhone: e.target.value })
                        }
                        placeholder="e.g. 020 7123 4567"
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-specialNeeds">Special needs</Label>
                      <Select
                        id="child-specialNeeds"
                        value={childForm.specialNeedsType}
                        onChange={(e) =>
                          updateChildForm({
                            specialNeedsType: e.target
                              .value as typeof childForm.specialNeedsType,
                            specialNeedsOther:
                              e.target.value !== "other"
                                ? ""
                                : childForm.specialNeedsOther,
                          })
                        }
                        className="mt-1"
                      >
                        <option value="none">None</option>
                        <option value="sen_support">SEN Support</option>
                        <option value="ehcp">EHCP</option>
                        <option value="other">Other</option>
                      </Select>
                    </div>
                    {childForm.specialNeedsType === "other" && (
                      <div className="sm:col-span-2">
                        <Label htmlFor="child-specialNeedsOther">
                          Please specify
                        </Label>
                        <Input
                          id="child-specialNeedsOther"
                          value={childForm.specialNeedsOther}
                          onChange={(e) =>
                            updateChildForm({
                              specialNeedsOther: e.target.value,
                            })
                          }
                          placeholder="Brief description"
                          className="mt-1"
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-additionalNeeds">
                        Additional needs (optional)
                      </Label>
                      <Textarea
                        id="child-additionalNeeds"
                        value={childForm.additionalNeedsNotes}
                        onChange={(e) =>
                          updateChildForm({
                            additionalNeedsNotes: e.target.value,
                          })
                        }
                        placeholder="Any other information we should know to support your child"
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-photo">
                        Child profile picture (optional)
                      </Label>
                      <Input
                        id="child-photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="mt-1 file:mr-4 file:rounded file:border-0 file:bg-accent-subtle file:px-4 file:py-2 file:text-text-primary"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) {
                            updateChildForm({
                              photoBase64: "",
                              photoContentType: "",
                            });
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            setError("Photo must be 5MB or smaller.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            const data = reader.result as string;
                            if (data.startsWith("data:")) {
                              updateChildForm({
                                photoBase64: data,
                                photoContentType: file.type || "image/jpeg",
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <p className="mt-1 text-xs text-text-muted">
                        This helps volunteers identify children and mark attendance accurately. It is optional, so guests who may not return can be added without one. If this child attends regularly, please add a clear photo.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <Checkbox
                          checked={childForm.photoConsent}
                          onChange={(e) =>
                            updateChildForm({
                              photoConsent: e.target.checked,
                            })
                          }
                          className="mt-0.5"
                        />
                        <span className="text-sm font-medium text-text-primary">
                          Organisation photo/video consent: I consent to photos or videos of this child being used by the organisation outside the internal attendance profile.
                        </span>
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="child-pickup">
                        Who can collect this child (optional)
                      </Label>
                      <Input
                        id="child-pickup"
                        value={childForm.pickupPermissions}
                        onChange={(e) =>
                          updateChildForm({
                            pickupPermissions: e.target.value,
                          })
                        }
                        placeholder="Names of people allowed to pick up"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-6 py-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAddChildModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateChild}
                    disabled={
                      !childForm.firstName.trim() ||
                      !childForm.lastName.trim() ||
                      isAdding
                    }
                  >
                    {isAdding ? "Creating…" : "Create child"}
                  </Button>
                </div>
              </div>
            </div>,
              document.body,
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
