"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import {
  AdminBehaviourApiError,
  type AdminBehaviourPolicyResponse,
  type AdminBehaviourType,
  type AdminBehaviourVisibility,
} from "@/lib/api-client";

type CreateInput = {
  name: string;
  type: AdminBehaviourType;
  visibility: AdminBehaviourVisibility;
  expectedCategoryVersion: number;
};

export function CreateCategoryDialog({
  categoryVersion,
  canSensitive,
  onSave,
  onCreated,
  onConflict,
  onClose,
}: {
  categoryVersion: number;
  canSensitive: boolean;
  onSave: (input: CreateInput) => Promise<AdminBehaviourPolicyResponse>;
  onCreated: (policy: AdminBehaviourPolicyResponse) => void;
  onConflict: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AdminBehaviourType>("MERIT");
  const [visibility, setVisibility] =
    React.useState<AdminBehaviourVisibility>("GENERAL");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => nameRef.current?.focus(), []);
  React.useEffect(() => {
    if (!canSensitive) setVisibility("GENERAL");
  }, [canSensitive]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) {
      setError("Enter a category name.");
      nameRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const policy = await onSave({
        name: cleanName,
        type,
        visibility: canSensitive ? visibility : "GENERAL",
        expectedCategoryVersion: categoryVersion,
      });
      onCreated(policy);
    } catch (cause) {
      if (cause instanceof AdminBehaviourApiError && cause.status === 409) {
        try {
          await onConflict();
          setError(
            "Categories changed. Review the current list and try again.",
          );
        } catch {
          setError(
            "Categories changed, but the current list could not be loaded. Close and reopen this form.",
          );
        }
      } else {
        setError(
          cause instanceof Error ? cause.message : "Unable to create category.",
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-category-title"
        aria-describedby="create-category-description"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) {
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), select:not([disabled])",
            ) ?? [],
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-5 shadow-xl"
      >
        <h2
          id="create-category-title"
          className="font-heading text-lg font-semibold text-text-primary"
        >
          New category
        </h2>
        <p
          id="create-category-description"
          className="mt-1 text-sm text-text-muted"
        >
          Add a category for the active ACE site. It will be available when
          recording behaviour.
        </p>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 space-y-4"
        >
          <div>
            <Label htmlFor="category-name">Category name</Label>
            <input
              ref={nameRef}
              id="category-name"
              value={name}
              maxLength={120}
              required
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            />
          </div>
          <div>
            <Label htmlFor="category-type">Type</Label>
            <select
              id="category-type"
              value={type}
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "MERIT" ||
                  value === "DEMERIT" ||
                  value === "GENERAL"
                ) {
                  setType(value);
                }
              }}
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            >
              <option value="MERIT">Merit</option>
              <option value="DEMERIT">Demerit</option>
              <option value="GENERAL">General</option>
            </select>
          </div>
          {canSensitive && (
            <div>
              <Label htmlFor="category-visibility">Visibility</Label>
              <select
                id="category-visibility"
                value={visibility}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "GENERAL" || value === "SENSITIVE") {
                    setVisibility(value);
                  }
                }}
                className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
              >
                <option value="GENERAL">Normal</option>
                <option value="SENSITIVE">Sensitive</option>
              </select>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create category"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
