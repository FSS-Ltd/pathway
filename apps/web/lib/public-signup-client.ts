/**
 * Client for public parent signup API (invite-only, token in URL).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export type SignupPreflightResult = {
  email: string;
  userExists: boolean;
  mode: "EXISTING_USER" | "NEW_USER";
  displayName?: string;
};

export type PublicSignupConfig = {
  orgName: string;
  siteName: string;
  siteTimezone?: string | null;
  parentPortalEnabled: boolean;
  requiredConsents: string[];
  formVersion: string;
};

export type PublicSignupSubmitPayload = {
  token: string;
  parent: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    relationshipToChild?: string;
  };
  emergencyContacts: Array<{
    name: string;
    phone: string;
    relationship?: string;
  }>;
  children: Array<{
    firstName: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth?: string;
    groupId?: string;
    allergies?: string;
    additionalNeedsNotes?: string;
    schoolName?: string;
    yearGroup?: string;
    gpName?: string;
    gpPhone?: string;
    specialNeedsType?: string;
    specialNeedsOther?: string;
    photoConsent: boolean;
    /** Base64-encoded internal profile picture for attendance identification. */
    photoBase64?: string;
    photoContentType?: string;
    pickupPermissions?: string;
  }>;
  consents: {
    dataProcessingConsent: boolean;
    firstAidConsent?: boolean;
  };
};

export type PublicSignupContactOnlyPayload = Omit<
  PublicSignupSubmitPayload,
  "parent"
> & {
  parent: {
    fullName: string;
    email: string;
    phone?: string;
    relationshipToChild?: string;
  };
};

export async function signupPreflight(
  token: string,
  email: string,
): Promise<SignupPreflightResult> {
  const res = await fetch(`${API_BASE_URL}/public/signup/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken: token, email: email.trim().toLowerCase() }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Preflight check failed");
  }
  return res.json() as Promise<SignupPreflightResult>;
}

export async function linkChildrenExistingUser(
  token: string,
  childIds: string[],
  authHeaders: HeadersInit,
): Promise<{ success: true; linkedCount: number }> {
  const res = await fetch(`${API_BASE_URL}/parents/link-children-existing-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    credentials: "include",
    body: JSON.stringify({
      inviteToken: token,
      children: childIds.map((childId) => ({ childId })),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to link children");
  }
  return res.json() as Promise<{ success: true; linkedCount: number }>;
}

export async function fetchPublicSignupConfig(
  token: string,
): Promise<PublicSignupConfig> {
  const res = await fetch(
    `${API_BASE_URL}/public/signup/config?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Invalid or expired signup link");
  }
  return res.json() as Promise<PublicSignupConfig>;
}

export async function submitPublicSignup(
  payload: PublicSignupSubmitPayload,
): Promise<{ success: true; message: string }> {
  const res = await fetch(`${API_BASE_URL}/public/signup/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Registration failed. Please try again.");
  }
  return res.json() as Promise<{ success: true; message: string }>;
}

export async function submitExistingUserSignup(
  payload: PublicSignupSubmitPayload,
): Promise<{ success: true; message: string }> {
  const res = await fetch(`${API_BASE_URL}/public/signup/submit-existing-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Registration failed. Please try again.");
  }
  return res.json() as Promise<{ success: true; message: string }>;
}

export async function submitContactOnlySignup(
  payload: PublicSignupContactOnlyPayload,
): Promise<{ success: true; message: string }> {
  const res = await fetch(`${API_BASE_URL}/public/signup/submit-contact-only`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Registration failed. Please try again.");
  }
  return res.json() as Promise<{ success: true; message: string }>;
}
