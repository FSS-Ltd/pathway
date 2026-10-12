"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea } from "@pathway/ui";
import { ClassColorPicker } from "../../../components/class-color-picker";
import {
  fetchActiveSiteState,
  createClass,
  type CreateClassPayload,
} from "../../../lib/api-client";

const resolveTenantId = (
  activeSiteId: string | null,
  sites: Array<{ id: string }>,
) => {
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? sites[0];
  return activeSite?.id ?? null;
};

export default function NewClassPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<CreateClassPayload>({
    name: "",
    minAge: null,
    maxAge: null,
    description: "",
    color: null,
    isActive: true,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof CreateClassPayload, string>>
  >({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      try {
        const state = await fetchActiveSiteState();
        setTenantId(resolveTenantId(state.activeSiteId, state.sites));
      } catch {
        setError("Failed to load active site");
      }
    };
    void load();
  }, []);

  const handleChange = (
    key: keyof CreateClassPayload,
    value: string | number | boolean | null,
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextErrors: typeof fieldErrors = {};
    if (!form.name?.trim()) {
      nextErrors.name = "Name is required.";
    }
    const min = form.minAge;
    const max = form.maxAge;
    if (
      min != null &&
      max != null &&
      typeof min === "number" &&
      typeof max === "number" &&
      min > max
    ) {
      nextErrors.maxAge = "Max age must be greater than or equal to min age.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (!tenantId) {
      setError("Active site required. Select a site in the top bar.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createClass(tenantId, {
        name: form.name!.trim(),
        minAge: form.minAge ?? undefined,
        maxAge: form.maxAge ?? undefined,
        description: form.description?.trim() || undefined,
        color: form.color ?? undefined,
        isActive: form.isActive ?? true,
      });
      router.push("/classes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create class");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push("/classes")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to classes
        </Button>
      </div>

      <Card
        title="New class"
        description="Create a new class or age group for this site."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Toddlers, Year 3"
              required
            />
            {fieldErrors.name ? (
              <p className="text-xs text-status-danger">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="minAge">Min age (optional)</Label>
              <Input
                id="minAge"
                type="number"
                min={0}
                max={99}
                value={form.minAge ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange("minAge", v === "" ? null : parseInt(v, 10));
                }}
                placeholder="e.g. 3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxAge">Max age (optional)</Label>
              <Input
                id="maxAge"
                type="number"
                min={0}
                max={99}
                value={form.maxAge ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  handleChange("maxAge", v === "" ? null : parseInt(v, 10));
                }}
                placeholder="e.g. 5"
              />
              {fieldErrors.maxAge ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.maxAge}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <ClassColorPicker
              id="class-color"
              value={form.color ?? null}
              onChange={(c) => handleChange("color", c)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={form.description ?? ""}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Admin-only notes"
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="isActive">Status</Label>
            <Select
              id="isActive"
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) =>
                handleChange("isActive", e.target.value === "active")
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <p className="text-xs text-text-muted">
              Inactive classes are hidden from session creation and new staff
              preferences. Core plan: max 4 active classes.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/classes")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !tenantId}>
              {submitting ? "Creating…" : "Create class"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
