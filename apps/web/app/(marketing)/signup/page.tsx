"use client";

import { ClerkProvider, useAuth, useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  HouseholdSection,
  PickupSection,
  RegistrationConsents,
  emptyConsentDecisions,
  type PickupEntry,
} from "./registration-sections";
import { GuardianSignupSection } from "./signup-guardian-section";
import { EmergencySignupSection } from "./signup-emergency-section";
import { ChildrenSignupSection } from "./signup-child-section";
import {
  defaultChild,
  defaultEmergency,
  GP_PHONE_REGEX,
  PASSWORD_REGEX,
  type ChildEntry,
  type EmergencyEntry,
} from "./signup-form-model";
import {
  fetchPublicSignupConfig,
  submitContactOnlySignup,
  submitPublicSignup,
  submitExistingUserSignup,
  signupPreflight,
  type ExistingUserSignupPayload,
  type PublicSignupConfig,
  type PublicSignupContactOnlyPayload,
  type PublicSignupSubmitPayload,
} from "../../../lib/public-signup-client";

function SignupContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
  const { getToken } = useAuth();

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

  const [homeAddress, setHomeAddress] = useState("");
  const [pickupContacts, setPickupContacts] = useState<PickupEntry[]>([]);
  const [consentDecisions, setConsentDecisions] = useState(
    emptyConsentDecisions,
  );

  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preflightMode, setPreflightMode] = useState<
    "idle" | "checking" | "EXISTING_USER" | "NEW_USER"
  >("idle");

  useEffect(() => {
    if (!token.trim()) {
      setConfigLoading(false);
      setConfigError(
        "Signup link is missing. Please use the link from your organisation.",
      );
      return;
    }
    let cancelled = false;
    fetchPublicSignupConfig(token)
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((err) => {
        if (!cancelled)
          setConfigError(
            err instanceof Error ? err.message : "Invalid or expired link",
          );
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

  const addEmergency = () =>
    setEmergencyContacts((prev) => [...prev, defaultEmergency()]);
  const removeEmergency = (id: string) => {
    if (emergencyContacts.length <= 1) return;
    setEmergencyContacts((prev) => prev.filter((e) => e.id !== id));
  };
  const updateEmergency = (id: string, updates: Partial<EmergencyEntry>) => {
    setEmergencyContacts((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    );
  };

  const addPickup = () =>
    setPickupContacts((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        name: "",
        phone: "",
        relationship: "",
        identificationNote: "",
      },
    ]);
  const updatePickup = (id: string, changes: Partial<PickupEntry>) =>
    setPickupContacts((previous) =>
      previous.map((contact) =>
        contact.id === id ? { ...contact, ...changes } : contact,
      ),
    );
  const removePickup = (id: string) =>
    setPickupContacts((previous) =>
      previous.filter((contact) => contact.id !== id),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus("idle");
    setSubmitError("");

    if (
      emergencyContacts.some(
        (contact) =>
          (contact.name.trim() ||
            contact.phone.trim() ||
            contact.relationship.trim() ||
            contact.email.trim() ||
            contact.secondaryPhone.trim()) &&
          (!contact.name.trim() || !contact.phone.trim()),
      )
    ) {
      setSubmitStatus("error");
      setSubmitError(
        "Complete each emergency contact's name and phone number.",
      );
      return;
    }
    if (
      children.some(
        (child) =>
          (child.firstName.trim() ||
            child.lastName.trim() ||
            child.dateOfBirth.trim()) &&
          (!child.firstName.trim() ||
            !child.lastName.trim() ||
            !child.dateOfBirth.trim()),
      )
    ) {
      setSubmitStatus("error");
      setSubmitError("Complete each child's name and date of birth.");
      return;
    }
    const ecValid = emergencyContacts.filter(
      (e) => e.name.trim() && e.phone.trim(),
    );
    if (ecValid.length === 0) {
      setSubmitStatus("error");
      setSubmitError(
        "At least one emergency contact with name and phone is required.",
      );
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
      setSubmitError(
        "Please enter a valid GP phone number (10-25 characters).",
      );
      return;
    }

    if (!consentDecisions.dataProcessing.granted) {
      setSubmitStatus("error");
      setSubmitError("You must agree to data processing to continue.");
      return;
    }

    if (!config) {
      setSubmitStatus("error");
      setSubmitError("Registration is still loading. Please try again.");
      return;
    }
    const parentPortalEnabled = config.parentPortalEnabled;

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
        formVersion: config.formVersion,
        homeAddress: homeAddress.trim(),
        pickupContacts: pickupContacts.map((contact) => ({
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          relationship: contact.relationship.trim() || undefined,
          identificationNote: contact.identificationNote.trim() || undefined,
        })),
        emergencyContacts: ecValid.map((e) => ({
          name: e.name.trim(),
          phone: e.phone.trim(),
          relationship: e.relationship.trim() || undefined,
          secondaryPhone: e.secondaryPhone.trim() || undefined,
          email: e.email.trim() || undefined,
          canPickUp: e.canPickUp,
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
          specialNeedsType:
            c.specialNeedsType !== "none" ? c.specialNeedsType : undefined,
          specialNeedsOther:
            c.specialNeedsType === "other" && c.specialNeedsOther.trim()
              ? c.specialNeedsOther.trim()
              : undefined,
          photoConsent: c.photoConsent,
          photoBase64: c.photoBase64 || undefined,
          photoContentType: c.photoContentType || undefined,
          pickupPermissions: c.pickupPermissions.trim() || undefined,
          homeLanguage: c.homeLanguage.trim() || undefined,
          medicalConditions: c.medicalConditions.trim() || undefined,
          medicationAtCentre: c.medicationAtCentre.trim() || undefined,
          dietaryRestrictions: c.dietaryRestrictions.trim() || undefined,
          learningSupport: c.learningSupport.trim() || undefined,
          interestsStrengths: c.interestsStrengths.trim() || undefined,
          settlingComfortNotes: c.settlingComfortNotes.trim() || undefined,
          registrationLevel: config?.aceRegistrationLevels
            ? c.registrationLevel
            : undefined,
        })),
        consents: {
          dataProcessingConsent: consentDecisions.dataProcessing.granted,
          firstAidConsent: consentDecisions.firstAid.granted,
          registration: consentDecisions,
        },
      };

      if (parentPortalEnabled && preflightMode === "EXISTING_USER") {
        if (!isSignInLoaded) {
          throw new Error(
            "Sign-in is still loading. Please try again in a moment.",
          );
        }
        const attempt = await signIn.create({
          identifier: parentEmail.trim().toLowerCase(),
          password: parentPassword,
        });
        if (attempt.status !== "complete") {
          throw new Error(
            "We've upgraded sign-in. Please reset your password to continue - check your email for a reset link.",
          );
        }
        await setActive({ session: attempt.createdSessionId });
        const clerkToken = await getToken();
        if (!clerkToken) {
          throw new Error(
            "Signed in, but couldn't start a session. Please try again.",
          );
        }
        const payload: ExistingUserSignupPayload["parent"] = {
          fullName: parentName.trim(),
          email: parentEmail.trim().toLowerCase(),
          phone: parentPhone.trim() || undefined,
          relationshipToChild: parentRelationship.trim() || undefined,
        };
        await submitExistingUserSignup(
          { ...commonPayload, parent: payload },
          clerkToken,
        );
      } else if (parentPortalEnabled) {
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
        await submitPublicSignup(payload);
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
      setSubmitError(
        isClerkAPIResponseError(err)
          ? (err.errors[0]?.longMessage ??
              err.errors[0]?.message ??
              "Sign-in failed.")
          : err instanceof Error
            ? err.message
            : "Registration failed. Please try again.",
      );
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
          <h1 className="text-xl font-semibold text-pw-text">
            Invalid or expired link
          </h1>
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
          <h1 className="text-2xl font-semibold text-pw-text">
            Registration complete
          </h1>
          <p className="mt-4 text-pw-text-muted">
            {parentPortalEnabled
              ? `Thank you for registering with ${config.siteName}. You can now sign in with your email and password to access your account.`
              : `Thank you for registering with ${config.siteName}. Your details have been recorded for the organisation.`}
          </p>
          {parentPortalEnabled ? (
            <p className="mt-2 text-sm text-pw-text-muted">
              We&apos;ve also sent a confirmation email. Check your spam folder
              if you don&apos;t see it.
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
          We only use your information to manage your family&apos;s place and
          keep children safe. See our{" "}
          <Link href="/privacy" className="text-pw-accent-strong underline">
            privacy policy
          </Link>
          .
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <GuardianSignupSection
          parentPortalEnabled={parentPortalEnabled}
          preflightMode={preflightMode}
          runPreflight={runPreflight}
          setPreflightMode={setPreflightMode}
          parentName={parentName}
          setParentName={setParentName}
          parentEmail={parentEmail}
          setParentEmail={setParentEmail}
          parentPassword={parentPassword}
          setParentPassword={setParentPassword}
          parentPasswordConfirm={parentPasswordConfirm}
          setParentPasswordConfirm={setParentPasswordConfirm}
          parentPhone={parentPhone}
          setParentPhone={setParentPhone}
          parentRelationship={parentRelationship}
          setParentRelationship={setParentRelationship}
        />

        <HouseholdSection
          address={homeAddress}
          onAddressChange={setHomeAddress}
        />

        <EmergencySignupSection
          emergencyContacts={emergencyContacts}
          addEmergency={addEmergency}
          removeEmergency={removeEmergency}
          updateEmergency={updateEmergency}
        />

        <ChildrenSignupSection
          children={children}
          addChild={addChild}
          removeChild={removeChild}
          updateChild={updateChild}
          config={config}
          setSubmitError={setSubmitError}
        />

        <PickupSection
          contacts={pickupContacts}
          onAdd={addPickup}
          onRemove={removePickup}
          onChange={updatePickup}
        />

        <RegistrationConsents
          config={config}
          decisions={consentDecisions}
          onChange={(key, decision) =>
            setConsentDecisions((previous) => ({
              ...previous,
              [key]: decision,
            }))
          }
        />

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
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      <Suspense
        fallback={
          <div className="mx-auto max-w-2xl px-4 py-16 text-center text-pw-text-muted">
            Loading…
          </div>
        }
      >
        <SignupContent />
      </Suspense>
    </ClerkProvider>
  );
}
