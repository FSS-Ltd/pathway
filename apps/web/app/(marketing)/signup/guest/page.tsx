"use client";

// Self-serve guest pass: a visiting parent registers a child for today only.
// Details are deleted ~24h after submission (workers guest-pass-cleanup sweep).

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  fetchPublicSignupConfig,
  submitGuestSignup,
  type PublicSignupConfig,
} from "../../../../lib/public-signup-client";

function GuestSignupContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [config, setConfig] = useState<PublicSignupConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [allergies, setAllergies] = useState("");
  const [additionalNeedsNotes, setAdditionalNeedsNotes] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [relationshipToChild, setRelationshipToChild] = useState("");
  const [consent, setConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setConfigError("Missing signup link token.");
      setConfigLoading(false);
      return;
    }
    fetchPublicSignupConfig(token)
      .then((c) => setConfig(c))
      .catch((err) =>
        setConfigError(err instanceof Error ? err.message : "Invalid or expired link"),
      )
      .finally(() => setConfigLoading(false));
  }, [token]);

  const canSubmit = Boolean(
    firstName.trim() && lastName.trim() && guardianName.trim() && guardianPhone.trim() && consent,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setSubmitError("Please complete all required fields and confirm consent.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitGuestSignup({
        token,
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
        dataProcessingConsent: consent,
      });
      setGuestExpiresAt(result.guestExpiresAt);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-pw-text-muted">Loading…</p>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-pw-border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-pw-text">Invalid or expired link</h1>
          <p className="mt-2 text-pw-text-muted">
            {configError ?? "This signup link is missing or no longer valid."}
          </p>
        </div>
      </div>
    );
  }

  if (guestExpiresAt) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-pw-border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-pw-text">Guest pass registered</h1>
          <p className="mt-4 text-pw-text-muted">
            Thanks — you&apos;re all set for today at {config.siteName}.
          </p>
          <p className="mt-2 text-sm text-pw-text-muted">
            These details will be automatically deleted at{" "}
            {new Date(guestExpiresAt).toLocaleString()}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-pw-text">Guest pass — {config.orgName}</h1>
        <p className="mt-2 text-pw-text-muted">
          Register a visiting child at {config.siteName} for today only.
        </p>
        <p className="mt-4 text-sm text-pw-text-muted">
          Your details are used only for today&apos;s visit and are automatically deleted
          24 hours after you submit this form.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-lg border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Child</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-pw-text">First name *</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">Last name *</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-pw-text">Date of birth</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-pw-text">Allergies</label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-pw-text">
              Medical / additional needs notes
            </label>
            <textarea
              rows={3}
              value={additionalNeedsNotes}
              onChange={(e) => setAdditionalNeedsNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
        </section>

        <section className="rounded-lg border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Your details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-pw-text">Full name *</label>
              <input
                type="text"
                required
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">Phone *</label>
              <input
                type="tel"
                required
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-pw-text">
              Relationship to child
            </label>
            <input
              type="text"
              value={relationshipToChild}
              onChange={(e) => setRelationshipToChild(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
        </section>

        <label className="flex items-start gap-2 text-sm text-pw-text">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          I consent to {config.orgName} processing this data for today&apos;s visit. I
          understand it will be deleted 24 hours after submission.
        </label>

        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-accent-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-accent-strong focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting…" : "Submit guest pass"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function GuestSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-pw-text-muted">
          Loading…
        </div>
      }
    >
      <GuestSignupContent />
    </Suspense>
  );
}
