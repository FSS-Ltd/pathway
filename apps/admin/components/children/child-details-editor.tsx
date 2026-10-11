"use client";

import { Button, Card, Input, Label, Select } from "@pathway/ui";

type Form = {
  firstName: string;
  lastName: string;
  preferredName: string;
  allergies: string;
  photoConsent: boolean;
  groupId: string;
};

export function ChildDetailsEditor({
  form,
  groups,
  canEdit,
  isSaving,
  fieldErrors,
  onChange,
  onSave,
}: {
  form: Form;
  groups: Array<{ id: string; name: string }>;
  canEdit: boolean;
  isSaving: boolean;
  fieldErrors: Partial<Record<"firstName" | "lastName", string>>;
  onChange: <K extends keyof Form>(key: K, value: Form[K]) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <section
      id="details"
      aria-labelledby="profile-details-heading"
      className="scroll-mt-6"
    >
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="profile-details-heading"
              className="text-lg font-bold text-text-primary"
            >
              Details
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Identity, care needs and group assignment.
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={() => void onSave()}
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="child-firstName">First name *</Label>
            <Input
              id="child-firstName"
              value={form.firstName}
              onChange={(event) => onChange("firstName", event.target.value)}
              disabled={!canEdit || isSaving}
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={
                fieldErrors.firstName ? "child-firstName-error" : undefined
              }
              className="mt-1"
            />
            {fieldErrors.firstName ? (
              <p
                id="child-firstName-error"
                className="mt-1 text-xs text-status-danger"
              >
                {fieldErrors.firstName}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="child-lastName">Last name *</Label>
            <Input
              id="child-lastName"
              value={form.lastName}
              onChange={(event) => onChange("lastName", event.target.value)}
              disabled={!canEdit || isSaving}
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={
                fieldErrors.lastName ? "child-lastName-error" : undefined
              }
              className="mt-1"
            />
            {fieldErrors.lastName ? (
              <p
                id="child-lastName-error"
                className="mt-1 text-xs text-status-danger"
              >
                {fieldErrors.lastName}
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="child-preferredName">Preferred name</Label>
            <Input
              id="child-preferredName"
              value={form.preferredName}
              onChange={(event) =>
                onChange("preferredName", event.target.value)
              }
              placeholder="If different from first name"
              disabled={!canEdit || isSaving}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="child-allergies">
              Allergies / key medical needs
            </Label>
            <Input
              id="child-allergies"
              value={form.allergies}
              onChange={(event) => onChange("allergies", event.target.value)}
              placeholder="e.g. none, peanuts, asthma"
              disabled={!canEdit || isSaving}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="child-photoConsent">
              Organisation photo/video consent
            </Label>
            <Select
              id="child-photoConsent"
              value={form.photoConsent ? "yes" : "no"}
              onChange={(event) =>
                onChange("photoConsent", event.target.value === "yes")
              }
              disabled={!canEdit || isSaving}
              className="mt-1"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
            <p className="mt-1 text-xs text-text-muted">
              Controls photos or videos used outside the internal attendance
              profile.
            </p>
          </div>
          <div>
            <Label htmlFor="child-groupId">Primary group / class</Label>
            <Select
              id="child-groupId"
              value={form.groupId}
              onChange={(event) => onChange("groupId", event.target.value)}
              disabled={!canEdit || isSaving}
              className="mt-1"
            >
              <option value="">Unassigned</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>
    </section>
  );
}
