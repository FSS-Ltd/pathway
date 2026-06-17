"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchPublicSignupConfig,
  submitContactOnlySignup,
  submitPublicSignup,
  submitExistingUserSignup,
  signupPreflight,
  type PublicSignupConfig,
  type PublicSignupContactOnlyPayload,
  type PublicSignupSubmitPayload,
} from "../../../lib/public-signup-client";

type ChildEntry = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string; // YYYY-MM-DD
  allergies: string;
  additionalNeedsNotes: string;
  schoolName: string;
  yearGroup: string;
  gpName: string;
  gpPhone: string;
  specialNeedsType: string; // none | sen_support | ehcp | other
  specialNeedsOther: string;
  photoConsent: boolean;
  /** Internal profile picture used for attendance identification. */
  photoBase64: string;
  photoContentType: string;
  pickupPermissions: string;
};

const GP_PHONE_REGEX = /^[\d\s+.() -]{10,25}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

type EmergencyEntry = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
};

const defaultChild = (): ChildEntry => ({
  id: crypto.randomUUID(),
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
  specialNeedsType: "none",
  specialNeedsOther: "",
  photoConsent: false,
  photoBase64: "",
  photoContentType: "",
  pickupPermissions: "",
});

const defaultEmergency = (): EmergencyEntry => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
  relationship: "",
});

function SignupContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [config, setConfig] = useState<PublicSignupConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [parentPasswordConfirm, setParentPasswordConfirm] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentRelationship, setParentRelationship] = useState("");

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyEntry[]>([
    defaultEmergency(),
  ]);
  const [children, setChildren] = useState<ChildEntry[]>([defaultChild()]);

  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);
  const [firstAidConsent, setFirstAidConsent] = useState(false);

  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflightMode, setPreflightMode] = useState<
    "idle" | "checking" | "EXISTING_USER" | "NEW_USER"
  >("idle");

  useEffect(() => {
    if (!token.trim()) {
      setConfigLoading(false);
      setConfigError("Signup link is missing. Please use the link from your organisation.");
      return;
    }
    let cancelled = false;
    fetchPublicSignupConfig(token)
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : "Invalid or expired link");
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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

  const runPreflight = async () => {
    if (config?.parentPortalEnabled === false) return;
    const email = parentEmail.trim().toLowerCase();
    if (!email || !email.includes("@") || !token.trim()) return;
    setPreflightMode("checking");
    try {
      const result = await signupPreflight(token, email);
      setPreflightMode(result.mode);
      if (result.mode === "EXISTING_USER" && result.displayName) {
        setParentName(result.displayName);
      }
    } catch {
      setPreflightMode("idle");
    }
  };

  const addEmergency = () => setEmergencyContacts((prev) => [...prev, defaultEmergency()]);
  const removeEmergency = (id: string) => {
    if (emergencyContacts.length <= 1) return;
    setEmergencyContacts((prev) => prev.filter((e) => e.id !== id));
  };
  const updateEmergency = (id: string, updates: Partial<EmergencyEntry>) => {
    setEmergencyContacts((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("idle");
    setSubmitError("");

    const ecValid = emergencyContacts.filter((e) => e.name.trim() && e.phone.trim());
    if (ecValid.length === 0) {
      setSubmitStatus("error");
      setSubmitError("At least one emergency contact with name and phone is required.");
      return;
    }

    const childrenValid = children.filter(
      (c) => c.firstName.trim() && c.lastName.trim() && c.dateOfBirth.trim(),
    );
    if (childrenValid.length === 0) {
      setSubmitStatus("error");
      setSubmitError(
        "At least one child with first name, last name, and date of birth is required.",
      );
      return;
    }

    const invalidGpPhone = childrenValid.find(
      (c) => c.gpPhone.trim() && !GP_PHONE_REGEX.test(c.gpPhone.trim()),
    );
    if (invalidGpPhone) {
      setSubmitStatus("error");
      setSubmitError("Please enter a valid GP phone number (10-25 characters).");
      return;
    }

    if (!dataProcessingConsent) {
      setSubmitStatus("error");
      setSubmitError("You must agree to data processing to continue.");
      return;
    }

    const parentPortalEnabled = config?.parentPortalEnabled ?? true;

    if (parentPortalEnabled) {
      if (preflightMode === "idle" || preflightMode === "checking") {
        setPreflightMode("checking");
        try {
          const result = await signupPreflight(
            token,
            parentEmail.trim().toLowerCase(),
          );
          setPreflightMode(result.mode);
          if (result.mode === "EXISTING_USER") {
            setSubmitStatus("error");
            setSubmitError("");
            return;
          }
        } catch {
          setPreflightMode("idle");
          setSubmitStatus("error");
          setSubmitError("Could not verify email. Please try again.");
          return;
        }
      }

      const isExistingUser = preflightMode === "EXISTING_USER";

      // New users: enforce password rules. Existing users: only verify non-empty (they already have a password).
      if (!isExistingUser) {
        if (parentPassword.length < 8) {
          setSubmitStatus("error");
          setSubmitError("Password must be at least 8 characters.");
          return;
        }
        if (!PASSWORD_REGEX.test(parentPassword)) {
          setSubmitStatus("error");
          setSubmitError(
            "Password must include at least one letter and one number.",
          );
          return;
        }
      } else if (!parentPassword.trim()) {
        setSubmitStatus("error");
        setSubmitError("Please enter your password.");
        return;
      }
      if (!isExistingUser && parentPassword !== parentPasswordConfirm) {
        setSubmitStatus("error");
        setSubmitError("Passwords do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const commonPayload = {
        token,
        emergencyContacts: ecValid.map((e) => ({
          name: e.name.trim(),
          phone: e.phone.trim(),
          relationship: e.relationship.trim() || undefined,
        })),
        children: childrenValid.map((c) => ({
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          preferredName: c.preferredName.trim() || undefined,
          dateOfBirth: c.dateOfBirth.trim() || undefined,
          allergies: c.allergies.trim() || undefined,
          additionalNeedsNotes: c.additionalNeedsNotes.trim() || undefined,
          schoolName: c.schoolName.trim() || undefined,
          yearGroup: c.yearGroup.trim() || undefined,
          gpName: c.gpName.trim() || undefined,
          gpPhone: c.gpPhone.trim() || undefined,
          specialNeedsType: c.specialNeedsType !== "none" ? c.specialNeedsType : undefined,
          specialNeedsOther:
            c.specialNeedsType === "other" && c.specialNeedsOther.trim()
              ? c.specialNeedsOther.trim()
              : undefined,
          photoConsent: c.photoConsent,
          photoBase64: c.photoBase64 || undefined,
          photoContentType: c.photoContentType || undefined,
          pickupPermissions: c.pickupPermissions.trim() || undefined,
        })),
        consents: {
          dataProcessingConsent: true,
          firstAidConsent: firstAidConsent || undefined,
        },
      };

      if (parentPortalEnabled) {
        const payload: PublicSignupSubmitPayload = {
          ...commonPayload,
          parent: {
            fullName: parentName.trim(),
            email: parentEmail.trim().toLowerCase(),
            password: parentPassword,
            phone: parentPhone.trim() || undefined,
            relationshipToChild: parentRelationship.trim() || undefined,
          },
        };
        if (preflightMode === "EXISTING_USER") {
          await submitExistingUserSignup(payload);
        } else {
          await submitPublicSignup(payload);
        }
      } else {
        const payload: PublicSignupContactOnlyPayload = {
          ...commonPayload,
          parent: {
            fullName: parentName.trim(),
            email: parentEmail.trim().toLowerCase(),
            phone: parentPhone.trim() || undefined,
            relationshipToChild: parentRelationship.trim() || undefined,
          },
        };
        await submitContactOnlySignup(payload);
      }
      setSubmitStatus("success");
    } catch (err) {
      setSubmitStatus("error");
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
        <div className="rounded-xl border border-pw-border bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-pw-text">Invalid or expired link</h1>
          <p className="mt-2 text-pw-text-muted">
            {configError ?? "This signup link is missing or no longer valid."}
          </p>
          <p className="mt-4 text-sm text-pw-text-muted">
            Please request a new link from your organisation or{" "}
            <Link href="/" className="text-pw-accent-strong underline">
              go to homepage
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const parentPortalEnabled = config.parentPortalEnabled;

  if (submitStatus === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-xl border border-pw-border bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-pw-text">Registration complete</h1>
          <p className="mt-4 text-pw-text-muted">
            {parentPortalEnabled
              ? `Thank you for registering with ${config.siteName}. You can now sign in with your email and password to access your account.`
              : `Thank you for registering with ${config.siteName}. Your details have been recorded for the organisation.`}
          </p>
          {parentPortalEnabled ? (
            <p className="mt-2 text-sm text-pw-text-muted">
              We&apos;ve also sent a confirmation email. Check your spam folder if you don&apos;t see it.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-pw-text">
          {parentPortalEnabled ? "Family registration" : "Child registration"}
        </h1>
        <p className="mt-2 text-pw-text-muted">
          {config.orgName} · {config.siteName}
        </p>
        <p className="mt-4 text-sm text-pw-text-muted">
          We only use your information to manage your family&apos;s place and keep children safe.
          See our{" "}
          <Link href="/privacy" className="text-pw-accent-strong underline">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Parent/Guardian */}
        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Parent / Guardian</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">Full name *</label>
              <input
                type="text"
                required
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">Email *</label>
              <input
                type="email"
                required
                value={parentEmail}
                onChange={(e) => {
                  setParentEmail(e.target.value);
                  setPreflightMode("idle");
                }}
                onBlur={parentPortalEnabled ? runPreflight : undefined}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
              {parentPortalEnabled && preflightMode === "checking" ? (
                <p className="mt-1 text-xs text-pw-text-muted">Checking…</p>
              ) : null}
            </div>
            {parentPortalEnabled ? (
              <div>
                <label className="block text-sm font-medium text-pw-text">
                  {preflightMode === "EXISTING_USER" ? "Your password *" : "Password *"}
                </label>
                <input
                  type="password"
                  required
                  value={parentPassword}
                  onChange={(e) => setParentPassword(e.target.value)}
                  placeholder={
                    preflightMode === "EXISTING_USER"
                      ? "Enter your password to link your children"
                      : "At least 8 characters with a letter and number"
                  }
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
                {preflightMode === "EXISTING_USER" ? (
                  <p className="mt-1 text-xs text-pw-text-muted">
                    This email is already registered. Enter your password to continue.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-pw-text-muted">
                    You&apos;ll use this to sign in after registration.
                  </p>
                )}
              </div>
            ) : null}
            {parentPortalEnabled && preflightMode !== "EXISTING_USER" ? (
              <div>
                <label className="block text-sm font-medium text-pw-text">Confirm password *</label>
                <input
                  type="password"
                  required
                  value={parentPasswordConfirm}
                  onChange={(e) => setParentPasswordConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">Phone</label>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">Relationship to child(ren)</label>
              <input
                type="text"
                value={parentRelationship}
                onChange={(e) => setParentRelationship(e.target.value)}
                placeholder="e.g. Parent, Guardian"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
          </div>
        </section>

        {/* Emergency contacts */}
        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Emergency contacts *</h2>
          <p className="mb-4 text-sm text-pw-text-muted">At least one required</p>
          {emergencyContacts.map((ec) => (
            <div key={ec.id} className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-pw-border p-4">
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-pw-text">Name</label>
                <input
                  type="text"
                  value={ec.name}
                  onChange={(e) => updateEmergency(ec.id, { name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-pw-text">Phone</label>
                <input
                  type="tel"
                  value={ec.phone}
                  onChange={(e) => updateEmergency(ec.id, { phone: e.target.value })}
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-pw-text">Relationship</label>
                <input
                  type="text"
                  value={ec.relationship}
                  onChange={(e) => updateEmergency(ec.id, { relationship: e.target.value })}
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
              </div>
              {emergencyContacts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEmergency(ec.id)}
                  className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text-muted hover:bg-muted"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addEmergency}
            className="rounded-md border border-pw-border bg-white px-4 py-2 text-sm text-pw-text hover:bg-muted"
          >
            Add another contact
          </button>
        </section>

        {/* Children */}
        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Children *</h2>
          <p className="mb-4 text-sm text-pw-text-muted">At least one child required</p>
          {children.map((child) => (
            <div
              key={child.id}
              className="mb-6 rounded-lg border border-pw-border p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-pw-text">First name *</label>
                  <input
                    type="text"
                    required
                    value={child.firstName}
                    onChange={(e) => updateChild(child.id, { firstName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pw-text">Last name *</label>
                  <input
                    type="text"
                    required
                    value={child.lastName}
                    onChange={(e) => updateChild(child.id, { lastName: e.target.value })}
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">Preferred name</label>
                  <input
                    type="text"
                    value={child.preferredName}
                    onChange={(e) => updateChild(child.id, { preferredName: e.target.value })}
                    placeholder="If different from first name"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pw-text">Date of birth *</label>
                  <input
                    type="date"
                    required
                    value={child.dateOfBirth}
                    onChange={(e) => updateChild(child.id, { dateOfBirth: e.target.value })}
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    Allergies or key medical needs
                  </label>
                  <input
                    type="text"
                    value={child.allergies}
                    onChange={(e) => updateChild(child.id, { allergies: e.target.value })}
                    placeholder="e.g. none, or list allergies / conditions we should know"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>

                <div className="sm:col-span-2">
                  <h3 className="mb-3 text-base font-medium text-pw-text">
                    Educational &amp; Medical Information
                  </h3>
                  <p className="mb-3 text-sm text-pw-text-muted">
                    This helps us support your child appropriately. All information is confidential.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    School / Nursery name
                  </label>
                  <input
                    type="text"
                    value={child.schoolName}
                    onChange={(e) => updateChild(child.id, { schoolName: e.target.value })}
                    placeholder="e.g. Oak Primary School"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pw-text">Year group</label>
                  <input
                    type="text"
                    value={child.yearGroup}
                    onChange={(e) => updateChild(child.id, { yearGroup: e.target.value })}
                    placeholder="e.g. Reception, Year 3"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pw-text">GP name</label>
                  <input
                    type="text"
                    value={child.gpName}
                    onChange={(e) => updateChild(child.id, { gpName: e.target.value })}
                    placeholder="Doctor or practice name"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    GP phone number
                  </label>
                  <input
                    type="tel"
                    value={child.gpPhone}
                    onChange={(e) => updateChild(child.id, { gpPhone: e.target.value })}
                    placeholder="e.g. 020 7123 4567"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    Special needs
                  </label>
                  <select
                    value={child.specialNeedsType}
                    onChange={(e) =>
                      updateChild(child.id, {
                        specialNeedsType: e.target.value,
                        specialNeedsOther: e.target.value !== "other" ? "" : child.specialNeedsOther,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  >
                    <option value="none">None</option>
                    <option value="sen_support">SEN Support</option>
                    <option value="ehcp">EHCP</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {child.specialNeedsType === "other" && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-pw-text">
                      Please specify
                    </label>
                    <input
                      type="text"
                      value={child.specialNeedsOther}
                      onChange={(e) => updateChild(child.id, { specialNeedsOther: e.target.value })}
                      placeholder="Brief description"
                      className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    Additional needs (optional)
                  </label>
                  <textarea
                    value={child.additionalNeedsNotes}
                    onChange={(e) => updateChild(child.id, { additionalNeedsNotes: e.target.value })}
                    placeholder="Any other information we should know to support your child"
                    rows={3}
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    Child profile picture (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="mt-1 block w-full text-sm text-pw-text-muted file:mr-4 file:rounded file:border-0 file:bg-pw-accent-subtle file:px-4 file:py-2 file:text-pw-text"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        updateChild(child.id, { photoBase64: "", photoContentType: "" });
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        setSubmitError("Photo must be 5MB or smaller.");
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
                  <p className="mt-1 text-xs text-pw-text-muted">
                    This helps volunteers identify children and mark attendance accurately. It is optional, so guests who may not return can be added without one. If this child attends regularly, please add a clear photo. JPEG, PNG or WebP. Max 5MB.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={child.photoConsent}
                      onChange={(e) => updateChild(child.id, { photoConsent: e.target.checked })}
                      className="mt-0.5 rounded border-pw-border"
                    />
                    <span className="text-sm font-medium text-pw-text">
                      Organisation photo/video consent: I consent to photos or videos of this child being used by the organisation outside the internal attendance profile.
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-pw-text">
                    Who can collect this child (optional)
                  </label>
                  <input
                    type="text"
                    value={child.pickupPermissions}
                    onChange={(e) => updateChild(child.id, { pickupPermissions: e.target.value })}
                    placeholder="Names of people allowed to pick up"
                    className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                  />
                </div>
              </div>
              {children.length > 1 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => removeChild(child.id)}
                    className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text-muted hover:bg-muted"
                  >
                    Remove child
                  </button>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addChild}
            className="rounded-md border border-pw-border bg-white px-4 py-2 text-sm text-pw-text hover:bg-muted"
          >
            Add another child
          </button>
        </section>

        {/* Consents */}
        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-pw-text">Consents</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                required
                checked={dataProcessingConsent}
                onChange={(e) => setDataProcessingConsent(e.target.checked)}
                className="mt-1 rounded border-pw-border"
              />
              <span className="text-sm text-pw-text">
                I agree to my and my child(ren)&apos;s data being processed by {config.siteName} and
                Nexsteps in line with the{" "}
                <Link href="/privacy" className="text-pw-accent-strong underline">
                  privacy policy
                </Link>{" "}
                *
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={firstAidConsent}
                onChange={(e) => setFirstAidConsent(e.target.checked)}
                className="mt-1 rounded border-pw-border"
              />
              <span className="text-sm text-pw-text">
                I consent to first aid being administered to my child(ren) when necessary
              </span>
            </label>
          </div>
        </section>

        {submitStatus === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-accent-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-accent-strong focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting…" : "Submit registration"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl px-4 py-16 text-center text-pw-text-muted">
          Loading…
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
