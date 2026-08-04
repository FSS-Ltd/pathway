"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card, Input, Label } from "@pathway/ui";
import { Checkbox } from "../../../components/ui/checkbox";
import { linkChildrenExistingUser } from "../../../lib/api-client";

type ChildEntry = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string;
  allergies: string;
  photoConsent: boolean;
  photoBase64: string;
  photoContentType: string;
};

const defaultChild = (): ChildEntry => ({
  id: crypto.randomUUID(),
  firstName: "",
  lastName: "",
  preferredName: "",
  dateOfBirth: "",
  allergies: "",
  photoConsent: false,
  photoBase64: "",
  photoContentType: "",
});

function SignupCompleteContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const { data: session, status } = useSession();

  const [children, setChildren] = React.useState<ChildEntry[]>([defaultChild()]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const addChild = () => setChildren((prev) => [...prev, defaultChild()]);
  const removeChild = (id: string) => {
    if (children.length <= 1) return;
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };
  const updateChild = (id: string, updates: Partial<ChildEntry>) => {
    setChildren((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const valid = children.filter(
      (c) => c.firstName.trim() && c.lastName.trim() && c.dateOfBirth.trim(),
    );
    if (valid.length === 0) {
      setError("At least one child with first name, last name, and date of birth is required.");
      return;
    }

    if (!token.trim()) {
      setError("Signup link is missing. Please use the link from your organisation.");
      return;
    }

    setSubmitting(true);
    try {
      await linkChildrenExistingUser(
        token,
        valid.map((c) => ({
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          preferredName: c.preferredName.trim() || undefined,
          dateOfBirth: c.dateOfBirth.trim() || undefined,
          allergies: c.allergies.trim() || undefined,
          photoConsent: c.photoConsent,
          photoBase64: c.photoBase64 || undefined,
          photoContentType: c.photoContentType || undefined,
        })),
      );
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "unauthenticated") {
    const loginUrl = `/login?returnTo=${encodeURIComponent(`/signup/complete?token=${encodeURIComponent(token)}`)}`;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Please sign in to link your children to your account.
          </p>
          <Button asChild className="mt-4">
            <Link href={loginUrl}>Sign in</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!token.trim()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card title="Invalid link">
          <p className="text-sm text-text-muted">
            This signup link is missing or invalid. Please use the link from your organisation.
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Go to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card title="Registration complete">
          <p className="text-sm text-text-muted">
            Your children have been linked to your account. You can now access your family dashboard.
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Go to dashboard</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">Link your children</h1>
        <p className="mt-2 text-sm text-text-muted">
          Add your children to complete your family registration.
        </p>
      </div>

      <Card title="Children">
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {children.map((child) => (
            <div
              key={child.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${child.id}-firstName`}>First name *</Label>
                  <Input
                    id={`${child.id}-firstName`}
                    value={child.firstName}
                    onChange={(e) => updateChild(child.id, { firstName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor={`${child.id}-lastName`}>Last name *</Label>
                  <Input
                    id={`${child.id}-lastName`}
                    value={child.lastName}
                    onChange={(e) => updateChild(child.id, { lastName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={`${child.id}-preferredName`}>Preferred name</Label>
                <Input
                  id={`${child.id}-preferredName`}
                  value={child.preferredName}
                  onChange={(e) => updateChild(child.id, { preferredName: e.target.value })}
                  placeholder="If different from first name"
                />
              </div>
              <div>
                <Label htmlFor={`${child.id}-dateOfBirth`}>Date of birth *</Label>
                <Input
                  id={`${child.id}-dateOfBirth`}
                  type="date"
                  value={child.dateOfBirth}
                  onChange={(e) => updateChild(child.id, { dateOfBirth: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor={`${child.id}-allergies`}>Allergies / key medical needs</Label>
                <Input
                  id={`${child.id}-allergies`}
                  value={child.allergies}
                  onChange={(e) => updateChild(child.id, { allergies: e.target.value })}
                  placeholder="e.g. none, peanuts"
                />
              </div>
              <div>
                <Label htmlFor={`${child.id}-profilePhoto`}>
                  Child profile picture (optional)
                </Label>
                <Input
                  id={`${child.id}-profilePhoto`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 file:mr-4 file:rounded file:border-0 file:bg-accent-subtle file:px-4 file:py-2 file:text-text-primary"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      updateChild(child.id, {
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
                        updateChild(child.id, {
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
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`${child.id}-photoConsent`}
                  checked={child.photoConsent}
                  onChange={(e) => updateChild(child.id, { photoConsent: e.target.checked })}
                  className="mt-0.5"
                />
                <Label htmlFor={`${child.id}-photoConsent`}>
                  Organisation photo/video consent
                  <span className="mt-1 block text-xs font-normal text-text-muted">
                    Consent for photos or videos of this child to be used outside the internal attendance profile.
                  </span>
                </Label>
              </div>
              {children.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeChild(child.id)}
                >
                  Remove child
                </Button>
              ) : null}
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addChild}>
            Add another child
          </Button>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Linking…" : "Link children"}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">Cancel</Link>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function SignupCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-sm text-text-muted">Loading…</p>
        </div>
      }
    >
      <SignupCompleteContent />
    </Suspense>
  );
}
