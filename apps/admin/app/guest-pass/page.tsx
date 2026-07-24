"use client";

// Staff/kiosk quick-add: registers a day-pass guest child, auto-deleted ~24h later.

import React from "react";
import { useSession } from "next-auth/react";
import { Button, Card, Input } from "@pathway/ui";
import {
  createGuestPassForCurrentSite,
  setApiClientToken,
  type GuestPassResult,
} from "../../lib/api-client";
import { useOrgLabel } from "@/lib/use-org-ui";

export default function GuestPassPage() {
  const title = useOrgLabel("/guest-pass", "Guest pass");
  const { data: session, status: sessionStatus } = useSession();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [allergies, setAllergies] = React.useState("");
  const [additionalNeedsNotes, setAdditionalNeedsNotes] = React.useState("");
  const [guardianName, setGuardianName] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [relationshipToChild, setRelationshipToChild] = React.useState("");
  const [consentConfirmed, setConsentConfirmed] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<GuestPassResult | null>(null);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
  }, [sessionStatus, session]);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setDateOfBirth("");
    setAllergies("");
    setAdditionalNeedsNotes("");
    setGuardianName("");
    setGuardianPhone("");
    setRelationshipToChild("");
    setConsentConfirmed(false);
  };

  const canSubmit = Boolean(
    firstName.trim() &&
      lastName.trim() &&
      guardianName.trim() &&
      guardianPhone.trim() &&
      consentConfirmed,
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) {
        setSubmitError("Please complete all required fields and confirm consent.");
        return;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const created = await createGuestPassForCurrentSite({
          child: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            dateOfBirth: dateOfBirth.trim() || undefined,
            allergies: allergies.trim() || undefined,
            additionalNeedsNotes: additionalNeedsNotes.trim() || undefined,
          },
          guardian: {
            fullName: guardianName.trim(),
            phone: guardianPhone.trim(),
            relationshipToChild: relationshipToChild.trim() || undefined,
          },
          consentConfirmed,
        });
        setResult(created);
        resetForm();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to create guest pass",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canSubmit,
      firstName,
      lastName,
      dateOfBirth,
      allergies,
      additionalNeedsNotes,
      guardianName,
      guardianPhone,
      relationshipToChild,
      consentConfirmed,
    ],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            {title}
          </h1>
          <p className="text-sm text-text-muted">
            Register a visiting child for today only. Their details are automatically
            deleted 24 hours after this pass is issued.
          </p>

          {result && (
            <div className="rounded-md border border-status-success/20 bg-status-success/5 p-3 text-sm text-text-primary">
              Guest pass created. Details will be deleted at{" "}
              {new Date(result.guestExpiresAt).toLocaleString()}.
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-text-primary">
                  Child first name <span className="text-status-danger">*</span>
                </label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-text-primary">
                  Child last name <span className="text-status-danger">*</span>
                </label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="mb-1 block text-sm font-medium text-text-primary">
                Date of birth (optional)
              </label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <div>
              <label htmlFor="allergies" className="mb-1 block text-sm font-medium text-text-primary">
                Allergies (optional)
              </label>
              <Input
                id="allergies"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. Peanuts"
              />
            </div>

            <div>
              <label htmlFor="additionalNeedsNotes" className="mb-1 block text-sm font-medium text-text-primary">
                Medical / additional needs notes (optional)
              </label>
              <textarea
                id="additionalNeedsNotes"
                rows={3}
                value={additionalNeedsNotes}
                onChange={(e) => setAdditionalNeedsNotes(e.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="guardianName" className="mb-1 block text-sm font-medium text-text-primary">
                  Guardian full name <span className="text-status-danger">*</span>
                </label>
                <Input
                  id="guardianName"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="guardianPhone" className="mb-1 block text-sm font-medium text-text-primary">
                  Guardian phone <span className="text-status-danger">*</span>
                </label>
                <Input
                  id="guardianPhone"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="relationshipToChild" className="mb-1 block text-sm font-medium text-text-primary">
                Relationship to child (optional)
              </label>
              <Input
                id="relationshipToChild"
                value={relationshipToChild}
                onChange={(e) => setRelationshipToChild(e.target.value)}
                placeholder="e.g. Parent, Grandparent"
                className="max-w-xs"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="mt-1"
              />
              I have confirmed the guardian's consent to process this child's data for
              today's visit. It will be deleted 24 hours from now.
            </label>

            {submitError && (
              <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">
                {submitError}
              </div>
            )}

            <div>
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "Creating…" : "Create guest pass"}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
