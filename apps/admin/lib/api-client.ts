// Admin API client supports two modes:
// - Real API: NEXT_PUBLIC_API_URL (preferred) or NEXT_PUBLIC_API_BASE_URL set -> backend calls enabled.
// - Explicit mock mode: NEXT_PUBLIC_USE_MOCK_API === "true" -> local-only mock data for development.
// Production environments MUST set NEXT_PUBLIC_API_URL (e.g., https://api.nexsteps.dev) and MUST NOT
// rely on implicit mock fallbacks.
const useMockApiExplicit =
  typeof process.env.NEXT_PUBLIC_USE_MOCK_API === "string" &&
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

const publicApiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;

if (!publicApiUrl && !useMockApiExplicit) {
  throw new Error(
    "Admin API client misconfigured: set NEXT_PUBLIC_API_URL or NEXT_PUBLIC_API_BASE_URL, or enable NEXT_PUBLIC_USE_MOCK_API for explicit mock mode.",
  );
}

export const API_BASE_URL = publicApiUrl ?? "http://localhost:3333";

const isUsingMockApi = (): boolean => {
  return useMockApiExplicit;
};

/** Metadata-only item for related safeguarding (no body/free text). */
export type AdminRelatedNoteMeta = {
  id: string;
  createdAt?: string;
  status?: string;
};
/** Metadata-only item for related safeguarding (no body/free text). */
export type AdminRelatedConcernMeta = {
  id: string;
  createdAt?: string;
  status?: string;
};

export type AdminSessionRow = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  ageGroup: string;
  room: string;
  status: "not_started" | "in_progress" | "completed";
  attendanceMarked: number;
  attendanceTotal: number;
  presentCount?: number;
  absentCount?: number;
  lateCount?: number;
  leadStaff?: string;
  supportStaff?: string[];
  /** When API embeds lesson data on session. */
  lesson?: {
    id?: string;
    title?: string;
    description?: string | null;
    resources?: Array<{
      label?: string;
      url?: string | null;
      type?: string | null;
    }> | null;
  } | null;
  lessonId?: string | null;
  /** When API returns related notes/concerns for session (metadata only). */
  relatedSafeguarding?: {
    notes?: AdminRelatedNoteMeta[];
    concerns?: AdminRelatedConcernMeta[];
  } | null;
};

export type AdminAssignmentRow = {
  id: string;
  sessionId: string;
  staffId: string;
  staffName: string;
  roleLabel: "Lead" | "Support" | string;
  status: "pending" | "confirmed" | "declined";
  sessionTitle?: string;
  sessionGroupName?: string;
  /** Hex color for the primary group (for rota/schedule card styling) */
  sessionGroupColor?: string | null;
  startsAt?: string;
  endsAt?: string;
};

export type AdminAssignmentInput = {
  sessionId: string;
  staffId: string;
  role: string;
  status?: "pending" | "confirmed" | "declined";
};

export type AdminRotaDay = {
  date: string; // YYYY-MM-DD
  assignments: AdminAssignmentRow[];
};

export type AdminSessionDetail = AdminSessionRow & {
  assignments?: AdminAssignmentRow[];
};

// SESSION FORMS (CreateSessionDto / UpdateSessionDto subset)
export type AdminSessionFormValues = {
  title: string;
  startsAt: string;
  endsAt: string;
  /** @deprecated use groupIds */
  groupId?: string;
  groupIds?: string[];
  tenantId?: string;
};

export type AdminChildRow = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  ageGroup?: string | null;
  primaryGroup?: string | null;
  /**
   * Primary group id (when available); used for session-scoped UIs like handover.
   */
  primaryGroupId?: string | null;
  hasPhotoConsent: boolean;
  hasAllergies: boolean;
  hasAdditionalNeeds: boolean;
  status: "active" | "inactive";
};

export type AdminChildDetail = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  ageGroupLabel?: string | null;
  primaryGroupLabel?: string | null;
  hasPhotoConsent: boolean;
  hasAllergies: boolean;
  hasAdditionalNeeds: boolean;
  status: "active" | "inactive";
  guardianContacts: AdminChildGuardianContact[];
};

export type AdminChildGuardianContact = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  relationshipToChild: string | null;
  contactType: "PRIMARY_GUARDIAN" | "EMERGENCY_CONTACT" | string;
};

export type AdminParentRow = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  children: { id: string; name: string }[];
  childrenCount?: number;
  isPrimaryContact: boolean;
  status: "active" | "inactive" | "archived";
};

export type AdminParentDetail = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  children: { id: string; fullName: string }[];
  childrenCount?: number;
  isPrimaryContact: boolean;
  status: "active" | "inactive" | "archived";
};

export type AdminAnnouncementRow = {
  id: string;
  title: string;
  audienceLabel: string;
  statusLabel: string;
  createdAt: string;
  scheduledAt?: string | null;
};

export type AdminAnnouncementDetail = {
  id: string;
  title: string;
  body: string | null;
  audienceLabel: string | null;
  status: "draft" | "scheduled" | "sent" | "archived" | "unknown" | string;
  createdAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  channels?: string[] | null;
  targetsSummary?: string | null;
};

export type MyNextHandoverUnavailable = { available: false };

export type MyNextHandoverAvailable = {
  available: true;
  sessionId: string;
  startsAt: string;
  handoverDate: string;
  logs: Array<{
    id: string;
    groupId: string;
    handoverDate: string;
    content: unknown;
  }>;
};

export type MyNextHandoverResponse =
  | MyNextHandoverUnavailable
  | MyNextHandoverAvailable;

export type HandoverLogStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED";


// ANNOUNCEMENTS FORMS (CreateAnnouncementDto / UpdateAnnouncementDto subset)
export type AdminAnnouncementFormValues = {
  title: string;
  body: string;
  audience: "ALL" | "PARENTS" | "STAFF";
  sendMode: "draft" | "now" | "schedule";
  scheduledAt?: string;
  channels?: string[];
  tenantId?: string;
};

export type AdminAttendanceRow = {
  id: string; // sessionId
  sessionId: string;
  title: string;
  date: string;
  timeRangeLabel: string;
  roomLabel: string | null;
  ageGroupLabel: string | null;
  attendanceMarked: number;
  attendanceTotal: number;
  status: "not_started" | "in_progress" | "completed";
};

export type AdminAttendanceDetail = {
  sessionId: string;
  title: string;
  date: string;
  timeRangeLabel: string;
  roomLabel: string | null;
  ageGroupLabel: string | null;
  rows: {
    childId: string;
    childName: string;
    status: "present" | "absent" | "late" | "unknown";
  }[];
  summary: {
    present: number;
    absent: number;
    late: number;
    unknown: number;
  };
  status: "not_started" | "in_progress" | "completed";
};

export type AdminConcernRow = {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  status: "open" | "in_review" | "closed" | "other";
  category?: string | null;
  childLabel: string;
  reportedByLabel?: string | null;
};

export type AdminConcernDetail = {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
  status: "open" | "in_review" | "closed" | "other";
  category?: string | null;
  summary?: string | null;
  childLabel: string;
  details?: string | null;
};

export type AdminNotesSummary = {
  totalNotes: number;
  visibleToParents: number;
  staffOnly: number;
};

export type AdminStaffRow = {
  id: string;
  fullName: string;
  email: string | null;
  rolesLabel: string;
  status: "active" | "inactive" | "unknown";
};

/** Staff list with eligibility for session assignment (availability / preferred group). */
export type StaffEligibilityRow = {
  id: string;
  fullName: string;
  eligible: boolean;
  reason?: "unavailable_at_time" | "does_not_prefer_group" | "blocked_on_date";
};

/** Assignment metadata for staff detail (no safeguarding content). */
export type AdminStaffAssignmentMeta = {
  sessionId?: string;
  sessionTitle?: string;
  startsAt?: string;
  role?: string;
  status?: string;
};

export type AdminStaffDetail = {
  id: string;
  fullName: string;
  email: string | null;
  roles: string[];
  primaryRoleLabel: string | null;
  status: "active" | "inactive" | "unknown";
  groups?: { id: string; name: string }[];
  sessionsCount?: number | null;
  /** When API returns assignment counts for this staff. */
  assignmentsSummary?: {
    total?: number;
    confirmed?: number;
    pending?: number;
    declined?: number;
  } | null;
  /** When API returns assignment list for this staff (metadata only). */
  assignments?: AdminStaffAssignmentMeta[] | null;
};

export type AdminBillingOverview = {
  orgId: string;
  isMasterOrg?: boolean;
  subscriptionStatus:
    | "ACTIVE"
    | "TRIALING"
    | "CANCELED"
    | "PAST_DUE"
    | "NONE"
    | string;
  planCode?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  av30Cap?: number | null;
  maxChildren?: number | null;
  currentAv30?: number | null;
  av30Enforcement?: {
    status: "OK" | "SOFT_CAP" | "GRACE" | "HARD_CAP";
    graceUntil: string | null;
    messageCode: string;
  };
  storageGbCap?: number | null;
  storageGbUsage?: number | null;
  smsMessagesCap?: number | null;
  smsMonthUsage?: number | null;
  leaderSeatsIncluded?: number | null;
  maxSites?: number | null;
};

export type AdminPlanPreviewRequest = {
  planCode: string;
  extraAv30Blocks?: number | null;
  extraStorageGb?: number | null;
  extraSmsMessages?: number | null;
  extraLeaderSeats?: number | null;
  extraSites?: number | null;
};

export type AdminBillingPrices = {
  provider: "stripe" | "fake";
  prices: {
    code: string;
    priceId: string;
    currency: string;
    unitAmount: number;
    interval: "month" | "year" | null;
    intervalCount: number | null;
    productName?: string | null;
    description?: string | null;
  }[];
  warnings?: string[];
};

export type AdminPlanPreview = {
  planCode: string | null;
  planTier: "core" | "starter" | "growth" | "enterprise" | null;
  baseAv30Included: number | null;
  effectiveAv30Cap: number | null;
  baseSitesIncluded: number | null;
  effectiveSitesCap: number | null;
  baseStorageGbIncluded: number | null;
  effectiveStorageGbCap: number | null;
  baseSmsMessagesIncluded: number | null;
  effectiveSmsMessagesCap: number | null;
  baseLeaderSeatsIncluded: number | null;
  effectiveLeaderSeatsIncluded: number | null;
  warnings: string[];
};

export type AdminBuyNowCheckoutRequest = {
  planCode: string;
  extraAv30Blocks?: number | null;
  extraStorageGb?: number | null;
  extraSmsMessages?: number | null;
  extraLeaderSeats?: number | null;
  extraSites?: number | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
  org: {
    orgName: string;
    contactName: string;
    contactEmail: string;
    notes?: string | null;
  };
};

export type AdminBuyNowCheckoutResponse = {
  sessionId: string;
  sessionUrl: string;
  warnings: string[];
  preview?: AdminPlanPreview;
};

/** Request for authenticated org admin purchase (no org/password; uses session org). */
export type AdminBuyNowPurchaseRequest = {
  planCode: string;
  extraAv30Blocks?: number | null;
  extraStorageGb?: number | null;
  extraSmsMessages?: number | null;
  extraLeaderSeats?: number | null;
  extraSites?: number | null;
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export type AdminOrgSector = "CHURCH" | "CLUB" | "SCHOOL" | "CHARITY";

export const ORG_SECTOR_LABELS: Record<AdminOrgSector, string> = {
  CHURCH: "Church",
  CLUB: "Club",
  SCHOOL: "School",
  CHARITY: "Charity",
};

export type AdminOrgOverview = {
  id: string;
  name: string;
  slug: string | null;
  isMultiSite: boolean;
  parentPortalEnabled: boolean;
  planTier?: string | null;
  siteCount?: number | null;
  sector?: AdminOrgSector | null;
  /** Org's white-label logo; null/absent falls back to the NexSteps mark. */
  logoUrl?: string | null;
};

export type AdminRetentionOverview = {
  attendanceRetentionYears?: number | null;
  safeguardingRetentionYears?: number | null;
  notesRetentionYears?: number | null;
};

export type AdminKpis = {
  totalChildren?: number;
  totalParents?: number;
  openConcerns?: number;
  positiveNotesCount?: number;
  av30Used?: number | null;
  av30Cap?: number | null;
  sessionsToday?: number;
  planTier?: string | null;
};

export type AdminLessonRow = {
  id: string;
  title: string;
  ageGroupLabel: string | null;
  groupLabel: string | null;
  status: "draft" | "published" | "archived" | "unknown";
  updatedAt: string | null;
};

export type AdminLessonDetail = {
  id: string;
  title: string;
  description: string | null;
  ageGroupLabel: string | null;
  groupLabel: string | null;
  status: "draft" | "published" | "archived" | "unknown";
  updatedAt: string | null;
  weekOf?: string | null;
  sessionId?: string | null;
  /** Attached resource file name (when stored as bytes until S3). */
  resourceFileName?: string | null;
  resources: { id: string; label: string; type?: string | null }[];
};

// LESSON FORMS (CreateLessonDto / UpdateLessonDto subset)
export type AdminLessonFormValues = {
  title: string;
  description?: string;
  weekOf?: string;
  groupId?: string;
  sessionId?: string | null;
  fileKey?: string;
  tenantId?: string;
  resources?: { label: string }[];
  /** Temporary: upload file as base64 until S3. */
  resourceFileBase64?: string | null;
  resourceFileName?: string | null;
};

// Auth header builder with support for runtime token injection.
// Preferred: NextAuth access token via setApiClientToken().
// Dev fallback: NEXT_PUBLIC_DEV_BEARER_TOKEN (should be empty in prod).
let accessTokenOverride: string | null = null;
export function setApiClientToken(token?: string | null) {
  accessTokenOverride = token ?? null;
}

function buildAuthHeaders(accessToken?: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const resolvedAccessToken = accessToken ?? accessTokenOverride;
  if (resolvedAccessToken) {
    headers["Authorization"] = `Bearer ${resolvedAccessToken}`;
    return headers;
  }

  const devToken = process.env.NEXT_PUBLIC_DEV_BEARER_TOKEN;
  if (devToken) {
    headers["Authorization"] = `Bearer ${devToken}`;
  }

  return headers;
}

/** Get current user id from API (when session.user.id is missing). */
export async function fetchMe(): Promise<{ userId: string }> {
  if (isUsingMockApi()) {
    return { userId: "" };
  }
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to get current user (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json() as Promise<{ userId: string }>;
}

// --- Auth / Active Site helpers ---
export type SiteOption = {
  id: string;
  name: string;
  orgId: string;
  orgName: string | null;
  orgSlug?: string | null;
  timezone?: string | null;
  role?: string | null;
};

export type ActiveSiteState = {
  activeSiteId: string | null;
  sites: SiteOption[];
};

export async function fetchActiveSiteState(): Promise<ActiveSiteState> {
  if (isUsingMockApi()) {
    return { activeSiteId: null, sites: [] };
  }
  const response = await fetch(`${API_BASE_URL}/auth/active-site`, {
    method: "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch active site: ${response.status}`);
  }
  return (await response.json()) as ActiveSiteState;
}

export type UserRolesResponse = {
  userId: string;
  superUser?: boolean;
  currentOrgIsMasterOrg?: boolean;
  orgRoles: Array<{ orgId: string; role: string }>;
  siteRoles: Array<{ tenantId: string; role: string }>;
  orgMemberships: Array<{ orgId: string; orgName: string; role: string }>;
  siteMemberships: Array<{
    tenantId: string;
    tenantName: string;
    orgId: string;
    role: string;
  }>;
  hasFamilyAccess?: boolean;
  hasServeAccess?: boolean;
};

/**
 * Fetch user roles from the API
 * This queries UserOrgRole, UserTenantRole, OrgMembership, and SiteMembership tables
 */
export async function fetchUserRoles(
  accessToken?: string | null,
): Promise<UserRolesResponse> {
  if (isUsingMockApi()) {
    // In mock mode, return an explicit empty role payload.
    return {
      userId: "mock-user",
      superUser: false,
      currentOrgIsMasterOrg: false,
      orgRoles: [],
      siteRoles: [],
      orgMemberships: [],
      siteMemberships: [],
    };
  }
  const response = await fetch(`${API_BASE_URL}/auth/active-site/roles`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch user roles: ${response.status}`);
  }
  return (await response.json()) as UserRolesResponse;
}

/**
 * Debug endpoint: returns resolved auth context (siteRole, tenantId, cookies, DB memberships).
 * Use when debugging staff attendance 403 or role resolution issues.
 */
export async function fetchAuthDebugContext(): Promise<{
  resolvedContext: {
    tenantId: string | null;
    orgId: string | null;
    siteRole: string | null;
    rolesOrg: string[];
    rolesTenant: string[];
  } | null;
  cookies: { pw_active_site_id: string; pw_active_org_id: string };
  userLastActiveTenantId: string | null;
  dbSiteMemberships: Array<{ tenantId: string; role: string }>;
  dbOrgMemberships: Array<{ orgId: string; role: string }>;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/active-site/debug-context`, {
    method: "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch debug context: ${response.status}`);
  }
  return response.json();
}

export async function setActiveSite(siteId: string): Promise<ActiveSiteState> {
  if (!siteId) {
    throw new Error("siteId is required");
  }
  if (isUsingMockApi()) {
    return { activeSiteId: siteId, sites: [] };
  }
  const response = await fetch(`${API_BASE_URL}/auth/active-site`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ siteId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to set active site: ${response.status}`);
  }
  return (await response.json()) as ActiveSiteState;
}

export type AdminPublicSignupLink = {
  tenantId: string;
  signupUrl: string;
  tokenExpiresAt: string | null;
  isStable: boolean;
};

/**
 * Get or create the stable public signup link for the current site. Returns full signup URL for QR.
 */
export async function fetchPublicSignupLinkForCurrentSite(): Promise<AdminPublicSignupLink> {
  if (isUsingMockApi()) {
    throw new Error("Parent signup QR requires the real API; disable mock API to use this feature.");
  }
  const res = await fetch(`${API_BASE_URL}/tenants/current/public-signup-link`, {
    method: "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to manage the parent signup link for this site."
        : res.status === 400
          ? "Active site context required. Select a site first."
          : `Failed to load signup link: ${res.status}${body ? ` ${body}` : ""}`,
    );
  }
  return (await res.json()) as AdminPublicSignupLink;
}

/**
 * Rotate (revoke current and create new) the public signup link for the current site.
 */
export async function rotatePublicSignupLinkForCurrentSite(): Promise<AdminPublicSignupLink> {
  if (isUsingMockApi()) {
    throw new Error("Parent signup QR requires the real API; disable mock API to use this feature.");
  }
  const res = await fetch(`${API_BASE_URL}/tenants/current/public-signup-link/rotate`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to manage the parent signup link for this site."
        : res.status === 400
          ? "Active site context required. Select a site first."
          : `Failed to rotate signup link: ${res.status}${body ? ` ${body}` : ""}`,
    );
  }
  return (await res.json()) as AdminPublicSignupLink;
}

export type GuestPassChildInput = {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  allergies?: string;
  additionalNeedsNotes?: string;
};

export type GuestPassGuardianInput = {
  fullName: string;
  phone: string;
  relationshipToChild?: string;
};

export type GuestPassResult = {
  childId: string;
  guestExpiresAt: string;
};

/**
 * Staff/kiosk quick-add: registers a day-pass guest child for the current site.
 * Auto-deleted ~24h later by the workers guest-pass-cleanup sweep.
 */
export async function createGuestPassForCurrentSite(input: {
  child: GuestPassChildInput;
  guardian: GuestPassGuardianInput;
  consentConfirmed: boolean;
}): Promise<GuestPassResult> {
  if (isUsingMockApi()) {
    throw new Error("Guest pass requires the real API; disable mock API to use this feature.");
  }
  const res = await fetch(`${API_BASE_URL}/guest-pass/current`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 400
        ? "Active site context required. Select a site first."
        : `Failed to create guest pass: ${res.status}${body ? ` ${body}` : ""}`,
    );
  }
  return (await res.json()) as GuestPassResult;
}

const getDefaultTenantId = () =>
  process.env.NEXT_PUBLIC_DEV_TENANT_ID ||
  process.env.NEXT_PUBLIC_TENANT_ID ||
  undefined;

const mapSessionStatus = (
  startsAt?: string,
  endsAt?: string,
): AdminSessionRow["status"] => {
  if (!startsAt || !endsAt) return "not_started";
  const now = Date.now();
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "not_started";
  if (now < startMs) return "not_started";
  if (now >= startMs && now <= endMs) return "in_progress";
  return "completed";
};

const buildTimeRangeLabel = (
  startsAt?: string,
  endsAt?: string,
): string | null => {
  if (!startsAt || !endsAt) return null;
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startTime} - ${endTime}`;
};

const isTodayLocal = (dateString?: string) => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

type ApiAssignment = {
  id: string;
  sessionId: string;
  userId: string;
  role?: string | null;
  status?: string | null;
  session?: {
    id: string;
    title?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    group?: { id: string; name: string } | null;
    groups?: { id: string; name: string; color?: string | null }[];
  } | null;
  user?: {
    id: string;
    name?: string | null;
  } | null;
};

const normalizeAssignmentStatus = (
  status?: string | null,
): AdminAssignmentRow["status"] => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "declined") return "declined";
  return "pending";
};

const normalizeRoleLabel = (role?: string | null): string => {
  if (!role) return "Support";
  const upper = role.toUpperCase();
  if (upper === "LEAD") return "Lead";
  if (upper === "SUPPORT") return "Support";
  const words = role
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return words.join(" ") || role;
};

export const mapApiAssignmentToAdminRow = (
  assignment: ApiAssignment,
  opts?: {
    sessionLookup?: Record<
      string,
      {
        title?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      }
    >;
    userLookup?: Record<string, { name?: string | null }>;
  },
): AdminAssignmentRow => {
  const sessionMeta =
    opts?.sessionLookup?.[assignment.sessionId] ??
    assignment.session ??
    undefined;
  const userMeta =
    opts?.userLookup?.[assignment.userId] ?? assignment.user ?? undefined;

  const startsAt = sessionMeta?.startsAt ?? undefined;
  const endsAt = sessionMeta?.endsAt ?? undefined;
  const staffId = assignment.userId ?? "unknown";
  const sessionGroupName = assignment.session?.groups?.length
    ? assignment.session.groups.map((g) => g.name).join(", ")
    : ((assignment.session as { group?: { name: string } })?.group?.name ??
      undefined);
  const sessionGroupColor =
    assignment.session?.groups?.[0]?.color ?? undefined;

  return {
    id: assignment.id,
    sessionId: assignment.sessionId,
    staffId,
    staffName:
      (userMeta?.name ?? "").trim() ||
      (staffId !== "unknown" ? `Staff ${staffId.slice(0, 4)}…` : "Staff"),
    roleLabel: normalizeRoleLabel(assignment.role),
    status: normalizeAssignmentStatus(assignment.status),
    sessionTitle: sessionMeta?.title ?? undefined,
    sessionGroupName: sessionGroupName ?? undefined,
    sessionGroupColor: sessionGroupColor ?? undefined,
    startsAt,
    endsAt,
  };
};

export const mapApiAssignmentsToRotaDays = (
  assignments: AdminAssignmentRow[],
): AdminRotaDay[] => {
  const grouped = new Map<string, AdminAssignmentRow[]>();

  assignments.forEach((assignment) => {
    const dateKey = (() => {
      if (!assignment.startsAt) return "unknown";
      const parsed = new Date(assignment.startsAt);
      if (Number.isNaN(parsed.getTime())) return "unknown";
      return parsed.toISOString().slice(0, 10);
    })();

    const existing = grouped.get(dateKey) ?? [];
    existing.push(assignment);
    grouped.set(dateKey, existing);
  });

  const sorted = Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a.localeCompare(b);
  });

  return sorted.map(([date, dayAssignments]) => ({
    date,
    assignments: [...dayAssignments].sort((a, b) => {
      const aStart = a.startsAt ?? "";
      const bStart = b.startsAt ?? "";
      return aStart.localeCompare(bStart);
    }),
  }));
};

const safeChildLabel = (
  childId?: string | null,
  child?: { firstName?: string | null; lastName?: string | null } | null,
): string => {
  // SAFEGUARDING: do NOT show full child names here. Initials only when available.
  const first = (child?.firstName ?? "").trim();
  const lastInitial = (child?.lastName ?? "").trim().charAt(0);
  if (first) {
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }
  if (childId) {
    return `Child ${childId.slice(0, 4)}…`;
  }
  return "Child record";
};

// TODO: wire real fetch with auth headers (PathwayRequestContext / Auth0)
export async function fetchSessionsMock(): Promise<AdminSessionRow[]> {
  return Promise.resolve([
    {
      id: "s1",
      title: "Year 3 Maths",
      startsAt: "2025-01-15T09:00:00Z",
      endsAt: "2025-01-15T09:50:00Z",
      ageGroup: "Year 3",
      room: "Room 12",
      status: "not_started",
      attendanceMarked: 0,
      attendanceTotal: 24,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      leadStaff: "Ms. Patel",
      supportStaff: ["Mr. Green"],
    },
    {
      id: "s2",
      title: "Year 5 Science",
      startsAt: "2025-01-15T11:00:00Z",
      endsAt: "2025-01-15T11:50:00Z",
      ageGroup: "Year 5",
      room: "Lab 2",
      status: "in_progress",
      attendanceMarked: 8,
      attendanceTotal: 22,
      presentCount: 8,
      absentCount: 2,
      lateCount: 0,
      leadStaff: "Dr. Hughes",
      supportStaff: ["Ms. Wong"],
    },
    {
      id: "s3",
      title: "After-school Coding Club",
      startsAt: "2025-01-15T15:30:00Z",
      endsAt: "2025-01-15T16:30:00Z",
      ageGroup: "Mixed Years 4-6",
      room: "ICT Suite",
      status: "completed",
      attendanceMarked: 18,
      attendanceTotal: 18,
      presentCount: 17,
      absentCount: 1,
      lateCount: 0,
      leadStaff: "Mr. Ali",
      supportStaff: ["Ms. Brown"],
    },
  ]);
}

type ApiSessionDetail = {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  ageGroup?: string | null;
  ageGroupLabel?: string | null;
  room?: string | null;
  roomName?: string | null;
  groupId?: string | null;
  groups?: { id: string; name: string }[];
  groupLabel?: string | null;
  attendanceMarked?: number | null;
  attendanceTotal?: number | null;
  presentCount?: number | null;
  absentCount?: number | null;
  lateCount?: number | null;
  leadStaff?: string | null;
  supportStaff?: string[] | null;
  lessonId?: string | null;
  lesson?: {
    id?: string;
    title?: string;
    description?: string | null;
    resources?: Array<{
      label?: string;
      url?: string | null;
      type?: string | null;
    }> | null;
  } | null;
  /** When API returns session with included lessons (e.g. GET /sessions/:id). */
  lessons?: Array<{
    id: string;
    title?: string;
    description?: string | null;
    resourceFileName?: string | null;
    fileKey?: string | null;
  }> | null;
  relatedSafeguarding?: {
    notes?: Array<{ id: string; createdAt?: string; status?: string }>;
    concerns?: Array<{ id: string; createdAt?: string; status?: string }>;
  } | null;
};

const mapApiSessionDetailToAdmin = (
  s: ApiSessionDetail,
): AdminSessionDetail & { groupId?: string | null; groupIds?: string[] } => ({
  id: s.id,
  title: s.title ?? "Session",
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  groupId: s.groups?.[0]?.id ?? s.groupId ?? undefined,
  groupIds: s.groups?.map((g) => g.id) ?? (s.groupId ? [s.groupId] : []),
  ageGroup: s.ageGroupLabel ?? s.ageGroup ?? "-",
  room:
    s.roomName ??
    s.room ??
    s.groupLabel ??
    s.groups?.[0]?.name ??
    s.groupId ??
    "-",
  status: mapSessionStatus(s.startsAt, s.endsAt),
  attendanceMarked:
    s.attendanceMarked ??
    (typeof s.presentCount === "number" ? s.presentCount : 0) +
      (typeof s.absentCount === "number" ? s.absentCount : 0) +
      (typeof s.lateCount === "number" ? s.lateCount : 0),
  attendanceTotal:
    s.attendanceTotal ??
    (typeof s.presentCount === "number" ? s.presentCount : 0) +
      (typeof s.absentCount === "number" ? s.absentCount : 0) +
      (typeof s.lateCount === "number" ? s.lateCount : 0),
  presentCount: typeof s.presentCount === "number" ? s.presentCount : undefined,
  absentCount: typeof s.absentCount === "number" ? s.absentCount : undefined,
  lateCount: typeof s.lateCount === "number" ? s.lateCount : undefined,
  leadStaff: s.leadStaff ?? undefined,
  supportStaff: s.supportStaff ?? undefined,
  lessonId: s.lessonId ?? s.lessons?.[0]?.id ?? undefined,
  lesson: (() => {
    const src = s.lesson ?? s.lessons?.[0];
    if (!src) return undefined;
    const raw = src as {
      id?: string;
      title?: string;
      description?: string | null;
      resourceFileName?: string | null;
      fileKey?: string | null;
    };
    const label =
      raw.resourceFileName ??
      (typeof raw.fileKey === "string"
        ? (raw.fileKey.split("/").pop() ?? "Resource")
        : "Resource");
    const resources =
      raw.resourceFileName || raw.fileKey
        ? [{ label, url: null as string | null, type: null as string | null }]
        : null;
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description ?? null,
      resources,
    };
  })(),
  relatedSafeguarding: s.relatedSafeguarding ?? undefined,
});

export async function fetchSessionById(
  id: string,
): Promise<AdminSessionDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    const all = await fetchSessionsMock();
    const session = all.find((s) => s.id === id);
    if (!session) return null;
    const sessionLookup = {
      [session.id]: {
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
    };
    const assignments = await fetchAssignmentsForOrg({
      sessionId: id,
      sessionLookup,
    });
    return { ...session, assignments };
  }

  const res = await fetch(`${API_BASE_URL}/sessions/${id}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch session: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiSessionDetail;
  const session = mapApiSessionDetailToAdmin(json);

  try {
    const sessionLookup = {
      [session.id]: {
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
    };
    const assignments = await fetchAssignmentsForOrg({
      sessionId: session.id,
      sessionLookup,
    });
    return { ...session, assignments };
  } catch (err) {
    console.warn("Failed to load assignments for session detail", err);
    return session;
  }
}

/** Staff attendance roster item from GET /sessions/:id/staff-attendance */
export type StaffAttendanceRosterItem = {
  staffUserId: string;
  displayName: string;
  roleLabel: string;
  assigned: boolean;
  attendanceStatus: "PRESENT" | "ABSENT" | "UNKNOWN";
};

export async function fetchSessionStaffAttendance(
  sessionId: string,
): Promise<StaffAttendanceRosterItem[]> {
  if (isUsingMockApi()) {
    return [];
  }
  const res = await fetch(
    `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/staff-attendance`,
    { headers: buildAuthHeaders(), credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch staff attendance: ${res.status} ${body || res.statusText}`,
    );
  }
  return (await res.json()) as StaffAttendanceRosterItem[];
}

export async function upsertSessionStaffAttendance(
  sessionId: string,
  payload: { staffUserId: string; status: "PRESENT" | "ABSENT" | "UNKNOWN" },
): Promise<StaffAttendanceRosterItem[]> {
  if (isUsingMockApi()) {
    throw new Error(
      "Cannot upsert staff attendance: API base URL is not set. Set NEXT_PUBLIC_API_URL.",
    );
  }
  const res = await fetch(
    `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/staff-attendance`,
    {
      method: "PATCH",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update staff attendance: ${res.status} ${body || res.statusText}`,
    );
  }
  return (await res.json()) as StaffAttendanceRosterItem[];
}

export type ExportAttendanceParams = {
  scope: "site" | "child" | "staff";
  id?: string;
  from: string;
  to: string;
  type?: "children" | "staff" | "all";
};

/** Triggers a CSV download for attendance export. Uses fetch + blob. */
export async function exportAttendanceCsv(params: ExportAttendanceParams): Promise<void> {
  if (isUsingMockApi()) {
    throw new Error(
      "Cannot export attendance: API base URL is not set. Set NEXT_PUBLIC_API_URL.",
    );
  }
  const { scope, id, from, to, type } = params;
  let url: string;
  if (scope === "site") {
    url = `${API_BASE_URL}/exports/attendance/site?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${type ? `&type=${encodeURIComponent(type)}` : ""}`;
  } else if (scope === "child" && id) {
    url = `${API_BASE_URL}/exports/attendance/child/${encodeURIComponent(id)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  } else if (scope === "staff" && id) {
    url = `${API_BASE_URL}/exports/attendance/staff/${encodeURIComponent(id)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  } else {
    throw new Error("Export requires id for child or staff scope");
  }
  const res = await fetch(url, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to export attendance: ${res.status} ${body || res.statusText}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? "nexsteps-attendance-export.csv";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Uses real API when NEXT_PUBLIC_API_BASE_URL is set; falls back to mock if missing.
export async function fetchSessions(): Promise<AdminSessionRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) return fetchSessionsMock();

  const res = await fetch(`${API_BASE_URL}/sessions`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to load sessions (${res.status}): ${body || res.statusText}`,
    );
  }

  type ApiSession = {
    id: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    groupId?: string | null;
    groups?: { id: string; name: string; color?: string | null }[];
    group?: { id: string; name: string } | null;
    groupLabel?: string | null;
    ageGroup?: string | null;
    ageGroupLabel?: string | null;
    room?: string | null;
    roomName?: string | null;
    attendanceMarked?: number | null;
    attendanceTotal?: number | null;
    presentCount?: number | null;
    absentCount?: number | null;
    lateCount?: number | null;
    tenantId: string;
  };

  const json = (await res.json()) as ApiSession[];

  return json.map((s) => ({
    id: s.id,
    title: s.title ?? "Session",
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    ageGroup:
      s.ageGroupLabel ??
      s.ageGroup ??
      s.groups?.[0]?.name ??
      s.group?.name ??
      "-",
    room:
      s.roomName ??
      s.room ??
      s.groupLabel ??
      s.groups?.[0]?.name ??
      s.group?.name ??
      s.groupId ??
      "-",
    status: mapSessionStatus(s.startsAt, s.endsAt),
    attendanceMarked:
      s.attendanceMarked ??
      (typeof s.presentCount === "number" ? s.presentCount : 0) +
        (typeof s.absentCount === "number" ? s.absentCount : 0) +
        (typeof s.lateCount === "number" ? s.lateCount : 0),
    attendanceTotal:
      s.attendanceTotal ??
      (typeof s.presentCount === "number" ? s.presentCount : 0) +
        (typeof s.absentCount === "number" ? s.absentCount : 0) +
        (typeof s.lateCount === "number" ? s.lateCount : 0),
    leadStaff: undefined,
    supportStaff: undefined,
  }));
}

// CreateSessionDto: tenantId, groupIds?, startsAt, endsAt, title?
export async function createSession(
  input: AdminSessionFormValues,
): Promise<AdminSessionDetail> {
  const groupIds = (
    input.groupIds?.length
      ? input.groupIds
      : input.groupId
        ? [input.groupId]
        : []
  ).filter(Boolean);
  const payload = {
    tenantId: input.tenantId ?? getDefaultTenantId(),
    ...(groupIds.length ? { groupIds } : {}),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    title: input.title?.trim() || undefined,
  };

  const res = await fetch(`${API_BASE_URL}/sessions`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create session (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiSessionDetail;
  return mapApiSessionDetailToAdmin(json);
}

// UpdateSessionDto: tenantId?, groupIds?, startsAt?, endsAt?, title?
export async function updateSession(
  id: string,
  input: Partial<AdminSessionFormValues>,
): Promise<AdminSessionDetail> {
  const groupIds =
    input.groupIds !== undefined
      ? input.groupIds.filter(Boolean)
      : input.groupId !== undefined
        ? input.groupId
          ? [input.groupId]
          : []
        : undefined;
  const payload = {
    ...(input.title ? { title: input.title.trim() } : {}),
    ...(input.startsAt ? { startsAt: input.startsAt } : {}),
    ...(input.endsAt ? { endsAt: input.endsAt } : {}),
    ...(groupIds !== undefined ? { groupIds } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };

  const res = await fetch(`${API_BASE_URL}/sessions/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update session (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiSessionDetail;
  return mapApiSessionDetailToAdmin(json);
}

export type BulkCreateSessionsInput = {
  groupIds: string[];
  startDate: string;
  endDate: string;
  daysOfWeek: ("SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT")[];
  startTime: string;
  endTime: string;
  titlePrefix?: string;
  assignmentUserIds?: string[];
};

/** Compute how many sessions would be created (excluding past dates). */
export function countBulkSessions(params: {
  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  startTime: string;
}): number {
  const start = new Date(params.startDate + "T00:00:00");
  const end = new Date(params.endDate + "T23:59:59");
  const requestedDays = new Set(params.daysOfWeek);
  const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const [h, m] = params.startTime.split(":").map(Number);
  const now = new Date();
  let count = 0;
  for (
    let d = new Date(start.getTime());
    d <= end;
    d.setDate(d.getDate() + 1)
  ) {
    const dayName = WEEKDAY[d.getDay()];
    if (!requestedDays.has(dayName)) continue;
    const sessionStart = new Date(d);
    sessionStart.setHours(h, m, 0, 0);
    if (sessionStart < now) continue;
    count++;
  }
  return count;
}

export async function bulkCreateSessions(
  input: BulkCreateSessionsInput,
): Promise<{ created: AdminSessionDetail[] }> {
  const res = await fetch(`${API_BASE_URL}/sessions/bulk`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to bulk create sessions (${res.status}): ${body || res.statusText}`,
    );
  }
  const json = (await res.json()) as { created: ApiSessionDetail[] };
  return {
    created: json.created.map((s) => mapApiSessionDetailToAdmin(s)),
  };
}

// ROTA: assignments are staff + session metadata only.
// Do not expose safeguarding content or internal provider payloads.
export async function fetchAssignmentsForOrg(
  params: {
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    sessionId?: string;
    sessionLookup?: Record<
      string,
      {
        title?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      }
    >;
    userLookup?: Record<string, { name?: string | null }>;
  } = {},
): Promise<AdminAssignmentRow[]> {
  const {
    dateFrom,
    dateTo,
    sessionId,
    sessionLookup: providedSessionLookup,
    userLookup: providedUserLookup,
  } = params;
  const useMock = isUsingMockApi();

  if (useMock) {
    const mockSessions = [
      {
        id: "s1",
        title: "Year 3 Maths",
        startsAt: "2025-01-15T09:00:00Z",
        endsAt: "2025-01-15T09:50:00Z",
      },
      {
        id: "s2",
        title: "Year 5 Science",
        startsAt: "2025-01-16T11:00:00Z",
        endsAt: "2025-01-16T11:50:00Z",
      },
      {
        id: "s3",
        title: "Coding Club",
        startsAt: "2025-01-17T15:30:00Z",
        endsAt: "2025-01-17T16:30:00Z",
      },
    ];
    const sessionLookup =
      providedSessionLookup ??
      mockSessions.reduce<
        Record<string, { title?: string; startsAt?: string; endsAt?: string }>
      >((acc, session) => {
        acc[session.id] = session;
        return acc;
      }, {});
    const userLookup = providedUserLookup ?? {
      u1: { name: "Alex Morgan" },
      u2: { name: "Jamie Lee" },
    };
    const mockAssignments: ApiAssignment[] = [
      {
        id: "a1",
        sessionId: "s1",
        userId: "u1",
        role: "LEAD",
        status: "CONFIRMED",
      },
      {
        id: "a2",
        sessionId: "s1",
        userId: "u2",
        role: "SUPPORT",
        status: "PENDING",
      },
      {
        id: "a3",
        sessionId: "s2",
        userId: "u1",
        role: "SUPPORT",
        status: "CONFIRMED",
      },
    ];
    const filteredBySession = sessionId
      ? mockAssignments.filter((a) => a.sessionId === sessionId)
      : mockAssignments;
    const filteredByDate = filteredBySession.filter((assignment) => {
      if (!dateFrom && !dateTo) return true;
      const session = sessionLookup[assignment.sessionId];
      if (!session?.startsAt) return false;
      const start = session.startsAt.slice(0, 10);
      if (dateFrom && start < dateFrom) return false;
      if (dateTo && start > dateTo) return false;
      return true;
    });
    return filteredByDate.map((a) =>
      mapApiAssignmentToAdminRow(a, { sessionLookup, userLookup }),
    );
  }

  let sessionLookup = providedSessionLookup;
  if ((dateFrom || dateTo) && !sessionLookup) {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    const sessionsRes = await fetch(
      `${API_BASE_URL}/sessions${qs.size ? `?${qs.toString()}` : ""}`,
      { headers: buildAuthHeaders(), cache: "no-store" },
    );
    if (sessionsRes.ok) {
      type ApiSessionForLookup = {
        id: string;
        title?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      };
      const sessionJson = (await sessionsRes.json()) as ApiSessionForLookup[];
      sessionLookup = sessionJson.reduce<
        Record<
          string,
          {
            title?: string | null;
            startsAt?: string | null;
            endsAt?: string | null;
          }
        >
      >((acc, s) => {
        acc[s.id] = {
          title: s.title ?? undefined,
          startsAt: s.startsAt ?? undefined,
          endsAt: s.endsAt ?? undefined,
        };
        return acc;
      }, {});
    } else {
      const body = await sessionsRes.text().catch(() => "");
      console.warn(
        "Failed to prefetch sessions for rota window",
        sessionsRes.status,
        body,
      );
    }
  }

  let userLookup = providedUserLookup;
  if (!userLookup) {
    try {
      const staff = await fetchStaff();
      userLookup = staff.reduce<Record<string, { name?: string | null }>>(
        (acc, person) => {
          acc[person.id] = { name: person.fullName };
          return acc;
        },
        {},
      );
    } catch (err) {
      console.warn("Failed to fetch staff lookup for assignments", err);
    }
  }

  const assignmentQuery = new URLSearchParams();
  if (sessionId) assignmentQuery.set("sessionId", sessionId);
  if (params.userId) assignmentQuery.set("userId", params.userId);
  if (params.dateFrom) assignmentQuery.set("dateFrom", params.dateFrom);
  if (params.dateTo) assignmentQuery.set("dateTo", params.dateTo);
  if (params.status)
    assignmentQuery.set(
      "status",
      params.status === "confirmed"
        ? "CONFIRMED"
        : params.status === "declined"
          ? "DECLINED"
          : "PENDING",
    );

  const res = await fetch(
    `${API_BASE_URL}/assignments${
      assignmentQuery.size ? `?${assignmentQuery.toString()}` : ""
    }`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to load assignments (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiAssignment[];
  const filtered = json.filter((assignment) => {
    if (!dateFrom && !dateTo) return true;
    const session = sessionLookup?.[assignment.sessionId];
    if (!session?.startsAt) return true;
    const start = session.startsAt.slice(0, 10);
    if (dateFrom && start < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  });

  return filtered.map((assignment) =>
    mapApiAssignmentToAdminRow(assignment, { sessionLookup, userLookup }),
  );
}

/** Fetch staff with eligibility for assigning to a session (group + start/end time). */
export async function fetchStaffEligibilityForSession(params: {
  groupId?: string | null;
  startsAt: string;
  endsAt: string;
}): Promise<StaffEligibilityRow[]> {
  const search = new URLSearchParams();
  if (params.groupId) search.set("groupId", params.groupId);
  search.set("startsAt", params.startsAt);
  search.set("endsAt", params.endsAt);
  const res = await fetch(
    `${API_BASE_URL}/staff/for-session-assignment?${search.toString()}`,
    {
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch staff eligibility (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json() as Promise<StaffEligibilityRow[]>;
}

export async function createAssignment(
  input: AdminAssignmentInput,
  opts?: {
    sessionLookup?: Record<
      string,
      {
        title?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      }
    >;
    userLookup?: Record<string, { name?: string | null }>;
  },
): Promise<AdminAssignmentRow> {
  const roleForApi =
    input.role === "Lead"
      ? "LEAD"
      : input.role === "Support"
        ? "SUPPORT"
        : input.role;
  const payload = {
    sessionId: input.sessionId,
    userId: input.staffId,
    role: roleForApi,
    status:
      input.status === "confirmed"
        ? "CONFIRMED"
        : input.status === "pending"
          ? "PENDING"
          : undefined,
  };

  const res = await fetch(`${API_BASE_URL}/assignments`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create assignment (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiAssignment;
  return mapApiAssignmentToAdminRow(json, {
    sessionLookup: opts?.sessionLookup,
    userLookup: opts?.userLookup,
  });
}

export async function updateAssignment(
  id: string,
  input: Partial<AdminAssignmentInput> & { status?: string },
  opts?: {
    sessionLookup?: Record<
      string,
      {
        title?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
      }
    >;
    userLookup?: Record<string, { name?: string | null }>;
  },
): Promise<AdminAssignmentRow> {
  const rawStatus = input.status as string | undefined;
  const normalizedStatus = rawStatus
    ? rawStatus === "confirmed"
      ? "CONFIRMED"
      : rawStatus === "pending"
        ? "PENDING"
        : rawStatus === "declined"
          ? "DECLINED"
          : rawStatus.toUpperCase()
    : undefined;

  const roleForApi = input.role
    ? input.role === "Lead"
      ? "LEAD"
      : input.role === "Support"
        ? "SUPPORT"
        : input.role
    : undefined;

  const payload = {
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.staffId ? { userId: input.staffId } : {}),
    ...(roleForApi ? { role: roleForApi } : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
  };

  const res = await fetch(`${API_BASE_URL}/assignments/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update assignment (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiAssignment;
  return mapApiAssignmentToAdminRow(json, {
    sessionLookup: opts?.sessionLookup,
    userLookup: opts?.userLookup,
  });
}

/** Update only the assignment status (accept/decline). Staff can only update their own unless admin. */
export async function updateAssignmentStatus(
  assignmentId: string,
  status: "pending" | "confirmed" | "declined",
): Promise<AdminAssignmentRow> {
  return updateAssignment(assignmentId, { status });
}

export async function deleteAssignment(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/assignments/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to delete assignment (${res.status}): ${body || res.statusText}`,
    );
  }
}

/** Fetch assignments for the current staff user (My Schedule). Pass userId from session. */
export async function fetchMyAssignments(params: {
  userId: string;
  dateFrom?: string;
  dateTo?: string;
  status?: "pending" | "confirmed" | "declined";
}): Promise<AdminAssignmentRow[]> {
  return fetchAssignmentsForOrg({
    userId: params.userId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    status: params.status,
  });
}

/** Minimal swap request shape for My Schedule / swap UI */
export type AdminSwapRequestRow = {
  id: string;
  assignmentId: string;
  fromUserId: string;
  toUserId: string | null;
  status: "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
};

export async function createSwapRequest(params: {
  fromUserId: string;
  assignmentId: string;
  toUserId: string;
}): Promise<AdminSwapRequestRow> {
  const res = await fetch(`${API_BASE_URL}/swaps`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      fromUserId: params.fromUserId,
      assignmentId: params.assignmentId,
      toUserId: params.toUserId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create swap request (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json() as Promise<AdminSwapRequestRow>;
}

/** Fetch swap requests where the current user is from or to. */
export async function fetchMySwapRequests(
  userId: string,
): Promise<AdminSwapRequestRow[]> {
  const [fromRes, toRes] = await Promise.all([
    fetch(`${API_BASE_URL}/swaps?fromUserId=${encodeURIComponent(userId)}`, {
      headers: buildAuthHeaders(),
      cache: "no-store",
    }),
    fetch(`${API_BASE_URL}/swaps?toUserId=${encodeURIComponent(userId)}`, {
      headers: buildAuthHeaders(),
      cache: "no-store",
    }),
  ]);
  if (!fromRes.ok || !toRes.ok) {
    const body =
      (await fromRes.text().catch(() => "")) ||
      (await toRes.text().catch(() => ""));
    throw new Error(`Failed to load swap requests: ${body || "unknown"}`);
  }
  const fromList = (await fromRes.json()) as AdminSwapRequestRow[];
  const toList = (await toRes.json()) as AdminSwapRequestRow[];
  const seen = new Set<string>();
  const merged: AdminSwapRequestRow[] = [];
  for (const r of [...fromList, ...toList]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }
  merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return merged;
}

export async function acceptSwapRequest(
  id: string,
): Promise<AdminSwapRequestRow> {
  const res = await fetch(`${API_BASE_URL}/swaps/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({ status: "ACCEPTED" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to accept swap (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json() as Promise<AdminSwapRequestRow>;
}

export async function declineSwapRequest(
  id: string,
): Promise<AdminSwapRequestRow> {
  const res = await fetch(`${API_BASE_URL}/swaps/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({ status: "DECLINED" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to decline swap (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json() as Promise<AdminSwapRequestRow>;
}

// TODO: replace with real API call using tenant-scoped endpoint and auth headers
export async function fetchChildrenMock(): Promise<AdminChildRow[]> {
  return Promise.resolve([
    {
      id: "c1",
      fullName: "Amara Patel",
      preferredName: "Amara",
      ageGroup: "Year 3",
      primaryGroup: "Year 3A",
      hasPhotoConsent: true,
      hasAllergies: true,
      hasAdditionalNeeds: false,
      status: "active",
    },
    {
      id: "c2",
      fullName: "Leo Williams",
      preferredName: null,
      ageGroup: "Year 4",
      primaryGroup: "Year 4B",
      hasPhotoConsent: false,
      hasAllergies: false,
      hasAdditionalNeeds: true,
      status: "active",
    },
    {
      id: "c3",
      fullName: "Sofia Nguyen",
      preferredName: "Sofia",
      ageGroup: "Year 5",
      primaryGroup: "Year 5A",
      hasPhotoConsent: true,
      hasAllergies: false,
      hasAdditionalNeeds: false,
      status: "inactive",
    },
  ]);
}

type ApiChild = {
  id: string;
  firstName: string;
  lastName: string;
  photoKey: string | null;
  allergies: string[] | null;
  disabilities: string[] | null;
  additionalNeeds?: string[] | null;
  groupId: string | null;
  group?: { id: string; name: string } | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  preferredName?: string | null;
  yearGroup?: string | null;
  ageGroup?: string | null;
  ageGroupLabel?: string | null;
  primaryGroup?: string | null;
  primaryGroupLabel?: string | null;
  hasPhotoConsent?: boolean | null;
  photoConsent?: boolean | null;
  status?: string | null;
  guardianContacts?: Array<{
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    relationshipToChild?: string | null;
    contactType?: string | null;
  }> | null;
};

type ApiChildDetail = ApiChild & {};

const mapApiChildToAdmin = (c: ApiChild): AdminChildRow => ({
  id: c.id,
  fullName: `${c.firstName} ${c.lastName}`.trim(),
  preferredName: c.preferredName ?? null,
  ageGroup: c.ageGroupLabel ?? c.ageGroup ?? c.yearGroup ?? "-",
  primaryGroup:
    c.group?.name ??
    c.primaryGroupLabel ??
    c.primaryGroup ??
    c.groupId ??
    "-",
  primaryGroupId: c.groupId ?? null,
  hasPhotoConsent: Boolean(c.hasPhotoConsent ?? c.photoConsent),
  hasAllergies: Array.isArray(c.allergies) && c.allergies.length > 0,
  hasAdditionalNeeds:
    (Array.isArray(c.disabilities) && c.disabilities.length > 0) ||
    (Array.isArray(c.additionalNeeds) && c.additionalNeeds.length > 0),
  status: c.status === "inactive" ? "inactive" : "active",
});

const mapApiChildDetailToAdmin = (c: ApiChildDetail): AdminChildDetail => ({
  id: c.id,
  fullName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Child",
  preferredName: c.preferredName ?? null,
  ageGroupLabel: c.ageGroupLabel ?? c.ageGroup ?? c.yearGroup ?? null,
  primaryGroupLabel:
    c.group?.name ??
    c.primaryGroupLabel ??
    c.primaryGroup ??
    c.groupId ??
    null,
  hasPhotoConsent: Boolean(c.hasPhotoConsent ?? c.photoConsent),
  hasAllergies: Array.isArray(c.allergies) && c.allergies.length > 0,
  hasAdditionalNeeds:
    (Array.isArray(c.disabilities) && c.disabilities.length > 0) ||
    (Array.isArray(c.additionalNeeds) && c.additionalNeeds.length > 0),
  status: c.status === "inactive" ? "inactive" : "active",
  guardianContacts: (c.guardianContacts ?? []).map((contact) => ({
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    relationshipToChild: contact.relationshipToChild ?? null,
    contactType: contact.contactType ?? "PRIMARY_GUARDIAN",
  })),
});

export async function fetchChildById(
  id: string,
): Promise<AdminChildDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    const all = await fetchChildrenMock();
    const match = all.find((c) => c.id === id);
    return match
      ? {
          id: match.id,
          fullName: match.fullName,
          preferredName: match.preferredName ?? null,
          ageGroupLabel: match.ageGroup ?? null,
          primaryGroupLabel: match.primaryGroup ?? null,
          hasPhotoConsent: match.hasPhotoConsent,
          hasAllergies: match.hasAllergies,
          hasAdditionalNeeds: match.hasAdditionalNeeds,
          status: match.status,
          guardianContacts: [],
        }
      : null;
  }

  const res = await fetch(`${API_BASE_URL}/children/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch child: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiChildDetail;
  const mapped = mapApiChildDetailToAdmin(json);
  return {
    ...mapped,
    status: json.status === "inactive" ? "inactive" : "active",
  };
}

/** Shape for edit form; includes raw API fields needed for UpdateChildPayload */
export type ChildEditFormData = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  allergies: string;
  photoConsent: boolean;
  groupId: string | null;
  guardianIds: string[];
};

export async function fetchChildForEdit(
  id: string,
): Promise<ChildEditFormData | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    const child = await fetchChildById(id);
    if (!child) return null;
    const [firstName, ...rest] = (child.fullName || " ").split(" ");
    const lastName = rest.join(" ") || "";
    return {
      id: child.id,
      firstName: firstName || "",
      lastName,
      preferredName: child.preferredName ?? null,
      allergies: "",
      photoConsent: child.hasPhotoConsent ?? false,
      groupId: null,
      guardianIds: [],
    };
  }

  const res = await fetch(`${API_BASE_URL}/children/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch child (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiChildDetail & {
    guardians?: { id: string }[];
  };
  const allergies =
    typeof json.allergies === "string"
      ? json.allergies
      : Array.isArray(json.allergies)
        ? (json.allergies as string[]).join(", ")
        : "";
  return {
    id: json.id,
    firstName: json.firstName ?? "",
    lastName: json.lastName ?? "",
    preferredName: json.preferredName ?? null,
    allergies,
    photoConsent: Boolean(json.hasPhotoConsent ?? json.photoConsent),
    groupId: json.groupId ?? json.group?.id ?? null,
    guardianIds: json.guardians?.map((g) => g.id) ?? [],
  };
}

// Uses real API when NEXT_PUBLIC_API_BASE_URL is set; falls back to mock if missing.
export async function fetchChildren(): Promise<AdminChildRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) return fetchChildrenMock();

  const res = await fetch(`${API_BASE_URL}/children`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch children (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiChild[];
  return json.map(mapApiChildToAdmin);
}

export type CreateChildPayload = {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dateOfBirth?: string | null; // YYYY-MM-DD
  allergies?: string | null;
  additionalNeedsNotes?: string | null;
  schoolName?: string | null;
  yearGroup?: string | null;
  gpName?: string | null;
  gpPhone?: string | null;
  specialNeedsType?: "none" | "sen_support" | "ehcp" | "other" | null;
  specialNeedsOther?: string | null;
  photoConsent?: boolean;
  photoBase64?: string | null;
  photoContentType?: string | null;
  pickupPermissions?: string | null;
  groupId?: string | null;
  guardianIds?: string[];
};

export async function createChild(
  payload: CreateChildPayload,
): Promise<{ id: string }> {
  if (isUsingMockApi()) {
    return { id: `mock-${crypto.randomUUID()}` };
  }

  const body: Record<string, unknown> = {
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    preferredName: payload.preferredName?.trim() || undefined,
    dateOfBirth: payload.dateOfBirth?.trim() || undefined,
    allergies: payload.allergies?.trim() || undefined,
    additionalNeedsNotes: payload.additionalNeedsNotes?.trim() || undefined,
    schoolName: payload.schoolName?.trim() || undefined,
    yearGroup: payload.yearGroup?.trim() || undefined,
    gpName: payload.gpName?.trim() || undefined,
    gpPhone: payload.gpPhone?.trim() || undefined,
    specialNeedsType: payload.specialNeedsType || undefined,
    specialNeedsOther: payload.specialNeedsOther?.trim() || undefined,
    photoConsent: payload.photoConsent ?? false,
    photoBase64: payload.photoBase64 || undefined,
    photoContentType: payload.photoContentType || undefined,
    pickupPermissions: payload.pickupPermissions?.trim() || undefined,
    groupId: payload.groupId || undefined,
    guardianIds: payload.guardianIds?.length ? payload.guardianIds : undefined,
  };

  const res = await fetch(`${API_BASE_URL}/children`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(
      `Failed to create child (${res.status}): ${errBody || res.statusText}`,
    );
  }

  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

export type UpdateChildPayload = {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  allergies?: string;
  photoConsent?: boolean;
  groupId?: string | null;
  guardianIds?: string[];
};

export async function updateChild(
  id: string,
  payload: UpdateChildPayload,
): Promise<AdminChildDetail | null> {
  if (isUsingMockApi()) {
    return fetchChildById(id);
  }

  const res = await fetch(`${API_BASE_URL}/children/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update child (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiChildDetail;
  return mapApiChildDetailToAdmin(json);
}

/** Link an existing parent to a child by email. Caller must be a linked parent. */
export async function linkParentToChild(
  childId: string,
  email: string,
): Promise<{ linked: true; parentId: string } | { userNotFound: true }> {
  if (isUsingMockApi()) {
    return { userNotFound: true };
  }
  const res = await fetch(`${API_BASE_URL}/children/${childId}/link-parent`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to link parent: ${res.status} ${body}`);
  }
  return res.json() as Promise<
    { linked: true; parentId: string } | { userNotFound: true }
  >;
}

/** Invite a parent to a child. ORG_ADMIN or linked parent only. Links if user exists, creates+invites if not. */
export async function inviteParentToChild(
  childId: string,
  email: string,
  name?: string,
): Promise<
  | { linked: true; parentId: string }
  | { invited: true; parentId: string }
  | { userNotFound: true }
> {
  if (isUsingMockApi()) {
    return { userNotFound: true };
  }
  const res = await fetch(`${API_BASE_URL}/children/${childId}/invite-parent`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ email: email.trim(), name: name?.trim() || undefined }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to invite parent: ${res.status} ${body}`);
  }
  return res.json() as Promise<
    | { linked: true; parentId: string }
    | { invited: true; parentId: string }
    | { userNotFound: true }
  >;
}

/** Upload internal child profile photo. Only admin or linked parent can upload. */
export async function uploadChildPhoto(
  childId: string,
  photoBase64: string,
  photoContentType?: string | null,
): Promise<void> {
  if (isUsingMockApi()) return;

  const res = await fetch(`${API_BASE_URL}/children/${childId}/photo`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      photoBase64,
      photoContentType: photoContentType ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to upload photo: ${res.status} ${body}`);
  }
}

// TODO: replace with real API call; include tenant/org context and auth
export async function fetchParentsMock(): Promise<AdminParentRow[]> {
  return Promise.resolve([
    {
      id: "p1",
      fullName: "Priya Patel",
      email: "priya.patel@example.edu",
      phone: "+44 7700 900001",
      children: [{ id: "c1", name: "Amara Patel" }],
      isPrimaryContact: true,
      status: "active",
    },
    {
      id: "p2",
      fullName: "Daniel Williams",
      email: "daniel.williams@example.edu",
      phone: "+44 7700 900002",
      children: [{ id: "c2", name: "Leo Williams" }],
      isPrimaryContact: true,
      status: "active",
    },
    {
      id: "p3",
      fullName: "Mai Nguyen",
      email: "mai.nguyen@example.edu",
      phone: null,
      children: [{ id: "c3", name: "Sofia Nguyen" }],
      isPrimaryContact: false,
      status: "inactive",
    },
  ]);
}

type ApiParentSummary = {
  id: string;
  fullName: string;
  email: string | null;
  childrenCount?: number;
  status?: string | null;
  isPrimaryContact?: boolean | null;
  phone?: string | null;
  children?: {
    id: string;
    fullName?: string | null;
    name?: string | null;
  }[];
};

type ApiParentDetail = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  children?: {
    id: string;
    fullName?: string | null;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }[];
  isPrimaryContact?: boolean | null;
  status?: string | null;
};

const normalizeParentStatus = (
  apiStatus: unknown,
): "active" | "inactive" | "archived" => {
  if (typeof apiStatus === "string") {
    const value = apiStatus.toLowerCase();
    if (value === "active") return "active";
    if (value === "archived") return "archived";
    if (value === "inactive" || value === "deactivated") return "inactive";
    // Safest fallback for unknown flags is to treat as inactive so we don't overstate access.
    return "inactive";
  }
  // Backend did not supply status; assume active but keep TODO for future hardening.
  // TODO: Update once parent.status or flags are guaranteed on all responses.
  return "active";
};

const mapApiParentToAdminParentRow = (
  api: ApiParentSummary,
): AdminParentRow => ({
  id: api.id,
  fullName: api.fullName || "Unknown parent",
  email: api.email ?? "",
  phone: api.phone ?? null,
  children:
    api.children?.map((child) => ({
      id: child.id,
      name: child.fullName ?? child.name ?? "Child",
    })) ?? [],
  childrenCount: api.childrenCount ?? api.children?.length,
  isPrimaryContact: Boolean(api.isPrimaryContact),
  status: normalizeParentStatus(api.status),
});

const mapApiParentDetailToAdmin = (
  api: ApiParentDetail,
): AdminParentDetail => ({
  id: api.id,
  fullName: api.fullName || "Unknown parent",
  email: api.email ?? "",
  phone: api.phone ?? null,
  children:
    api.children?.map((child) => ({
      id: child.id,
      fullName:
        child.fullName ??
        child.name ??
        (`${child.firstName ?? ""} ${child.lastName ?? ""}`.trim() || "Child"),
    })) ?? [],
  childrenCount: api.children?.length ?? undefined,
  isPrimaryContact: Boolean(api.isPrimaryContact),
  status: normalizeParentStatus(api.status),
});

export async function fetchParentById(
  id: string,
): Promise<AdminParentDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    const all = await fetchParentsMock();
    const match = all.find((p) => p.id === id);
    return match
      ? {
          id: match.id,
          fullName: match.fullName,
          email: match.email,
          phone: match.phone ?? null,
          children:
            match.children?.map((child) => ({
              id: child.id,
              fullName: child.name ?? "Child",
            })) ?? [],
          childrenCount: match.childrenCount ?? match.children.length,
          isPrimaryContact: match.isPrimaryContact,
          status: match.status,
        }
      : null;
  }

  const res = await fetch(`${API_BASE_URL}/parents/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error(`Failed to fetch parent: ${res.status} ${body}`);
  }

  const json = (await res.json()) as ApiParentDetail;
  return mapApiParentDetailToAdmin(json);
}

export type UpdateParentPayload = {
  displayName?: string;
  childIds?: string[];
};

export async function linkChildrenExistingUser(
  inviteToken: string,
  childrenToCreate: Array<{
    firstName?: string;
    lastName?: string;
    preferredName?: string;
    dateOfBirth?: string;
    allergies?: string;
    photoConsent?: boolean;
    photoBase64?: string;
    photoContentType?: string;
  }>,
): Promise<{ success: true; linkedCount: number }> {
  if (isUsingMockApi()) {
    return { success: true, linkedCount: childrenToCreate.length };
  }

  const res = await fetch(`${API_BASE_URL}/parents/link-children-existing-user`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      inviteToken,
      childrenToCreate,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to link children (${res.status}): ${body}`);
  }

  return res.json() as Promise<{ success: true; linkedCount: number }>;
}

export async function updateParent(
  id: string,
  payload: UpdateParentPayload,
): Promise<AdminParentDetail | null> {
  if (isUsingMockApi()) {
    return fetchParentById(id);
  }

  const res = await fetch(`${API_BASE_URL}/parents/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      displayName: payload.displayName,
      childIds: payload.childIds,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update parent (${res.status}): ${body}`);
  }

  const json = (await res.json()) as ApiParentDetail;
  return mapApiParentDetailToAdmin(json);
}

// Uses real API when NEXT_PUBLIC_API_BASE_URL is set; falls back to mock if missing.
export async function fetchParents(): Promise<AdminParentRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) return fetchParentsMock(); // Fallback to mock data when API base URL is not configured.

  const res = await fetch(`${API_BASE_URL}/parents`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch parents: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiParentSummary[];
  return json.map(mapApiParentToAdminParentRow);
}

type ApiAnnouncement = {
  id: string;
  title: string;
  status: string;
  audience?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
};

const statusLabelMap: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
  archived: "Archived",
};

const audienceLabelMap: Record<string, string> = {
  parents: "Parents",
  staff: "Staff",
  parents_staff: "Parents & staff",
};

const mapApiAnnouncementToAdminRow = (
  api: ApiAnnouncement,
): AdminAnnouncementRow => ({
  id: api.id,
  title: api.title,
  audienceLabel:
    (api.audience && audienceLabelMap[api.audience]) || api.audience || "-",
  statusLabel: statusLabelMap[api.status] ?? api.status ?? "Unknown",
  createdAt: api.createdAt,
  scheduledAt: api.scheduledAt ?? null,
});

const mapApiAnnouncementToAdminDetail = (
  api: ApiAnnouncement,
): AdminAnnouncementDetail => ({
  id: api.id,
  title: api.title,
  body: (api as { body?: string | null }).body ?? null,
  audienceLabel:
    (api.audience && audienceLabelMap[api.audience]) || api.audience || null,
  status:
    api.status === "draft" ||
    api.status === "scheduled" ||
    api.status === "sent" ||
    api.status === "archived"
      ? api.status
      : (api.status ?? "unknown"),
  createdAt: api.createdAt ?? null,
  scheduledAt: api.scheduledAt ?? null,
  publishedAt: (api as { publishedAt?: string | null }).publishedAt ?? null,
  channels:
    ((api as { channels?: string[] | null }).channels ??
    (api as { channel?: string | null }).channel)
      ? [(api as { channel?: string | null }).channel as string]
      : null,
  targetsSummary:
    (api as { targetsSummary?: string | null }).targetsSummary ?? null,
});

export async function fetchAnnouncements(): Promise<AdminAnnouncementRow[]> {
  if (isUsingMockApi()) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return [
      {
        id: "a1",
        title: "Staff inset day reminder",
        audienceLabel: "Staff",
        statusLabel: "Scheduled",
        createdAt: new Date().toISOString(),
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      {
        id: "a2",
        title: "Parents evening signup",
        audienceLabel: "Parents",
        statusLabel: "Draft",
        createdAt: new Date().toISOString(),
        scheduledAt: null,
      },
    ];
  }

  const res = await fetch(`${API_BASE_URL}/announcements`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch announcements: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiAnnouncement[];
  return json.map(mapApiAnnouncementToAdminRow);
}

export async function fetchRecentAnnouncements(
  limit = 4,
): Promise<AdminAnnouncementRow[]> {
  const all = await fetchAnnouncements();
  return all
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

// NOTICES: detail view is read-only; do not surface provider payloads or internal delivery logs here.
export async function fetchAnnouncementById(
  id: string,
): Promise<AdminAnnouncementDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    const mock = await fetchAnnouncements();
    const row = mock.find((a) => a.id === id);
    return row
      ? {
          id: row.id,
          title: row.title,
          body: "Mock announcement body.",
          audienceLabel: row.audienceLabel,
          status:
            row.statusLabel.toLowerCase() as AdminAnnouncementDetail["status"],
          createdAt: row.createdAt,
          scheduledAt: row.scheduledAt ?? null,
          publishedAt: row.scheduledAt ?? null,
          channels: ["in-app"],
          targetsSummary: row.audienceLabel,
        }
      : null;
  }

  const res = await fetch(`${API_BASE_URL}/announcements/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch announcement: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiAnnouncement;
  return mapApiAnnouncementToAdminDetail(json);
}

// CreateAnnouncementDto fields: tenantId, title, body, audience, publishedAt?
export async function createAnnouncement(
  input: AdminAnnouncementFormValues,
): Promise<AdminAnnouncementDetail> {
  const publishedAt =
    input.sendMode === "now"
      ? new Date().toISOString()
      : input.sendMode === "schedule"
        ? input.scheduledAt
        : undefined;

  const payload = {
    tenantId: input.tenantId ?? getDefaultTenantId(),
    title: input.title?.trim(),
    body: input.body?.trim(),
    audience: input.audience,
    ...(publishedAt ? { publishedAt } : {}),
  };

  const res = await fetch(`${API_BASE_URL}/announcements`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create announcement (${res.status}): ${
        body || res.statusText
      }`,
    );
  }

  const json = (await res.json()) as ApiAnnouncement;
  return mapApiAnnouncementToAdminDetail(json);
}

// UpdateAnnouncementDto fields: title?, body?, audience?, publishedAt?
export async function updateAnnouncement(
  id: string,
  input: Partial<AdminAnnouncementFormValues>,
): Promise<AdminAnnouncementDetail> {
  const publishedAt =
    input.sendMode === "now"
      ? new Date().toISOString()
      : input.sendMode === "schedule"
        ? input.scheduledAt
        : input.sendMode === "draft"
          ? null
          : undefined;

  const payload = {
    ...(input.title ? { title: input.title.trim() } : {}),
    ...(input.body ? { body: input.body.trim() } : {}),
    ...(input.audience ? { audience: input.audience } : {}),
    ...(typeof publishedAt !== "undefined" ? { publishedAt } : {}),
  };

  const res = await fetch(`${API_BASE_URL}/announcements/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update announcement (${res.status}): ${
        body || res.statusText
      }`,
    );
  }

  const json = (await res.json()) as ApiAnnouncement;
  return mapApiAnnouncementToAdminDetail(json);
}

// REPORTS: aggregate safe metrics only (counts/ratios). Do NOT surface safeguarding text or provider payloads.
export async function fetchAdminKpis(): Promise<AdminKpis> {
  const results = await Promise.allSettled([
    fetchChildren(),
    fetchParents(),
    fetchOpenConcerns(),
    fetchNotesSummary(),
    fetchBillingOverview(),
    fetchSessions(),
  ]);

  const children =
    results[0].status === "fulfilled" ? (results[0].value ?? []) : undefined;
  const parents =
    results[1].status === "fulfilled" ? (results[1].value ?? []) : undefined;
  const concerns =
    results[2].status === "fulfilled" ? (results[2].value ?? []) : undefined;
  const notesSummary =
    results[3].status === "fulfilled" ? (results[3].value ?? null) : undefined;
  const billing =
    results[4].status === "fulfilled" ? (results[4].value ?? null) : undefined;
  const sessions =
    results[5].status === "fulfilled" ? (results[5].value ?? []) : undefined;

  const kpis: AdminKpis = {
    totalChildren: Array.isArray(children) ? children.length : undefined,
    totalParents: Array.isArray(parents) ? parents.length : undefined,
    openConcerns: Array.isArray(concerns) ? concerns.length : undefined,
    positiveNotesCount: notesSummary ? notesSummary.totalNotes : undefined,
    av30Used: billing ? (billing.currentAv30 ?? null) : null,
    av30Cap: billing ? (billing.av30Cap ?? null) : null,
    sessionsToday: Array.isArray(sessions)
      ? sessions.filter(
          (s) => isTodayLocal(s.startsAt) || isTodayLocal(s.endsAt),
        ).length
      : undefined,
    planTier: billing?.planCode ?? null,
  };

  const allRejected = results.every((r) => r.status === "rejected");
  if (allRejected) {
    throw new Error("Failed to load reports data");
  }

  return kpis;
}

type ApiLessonGroup = {
  id: string;
  name: string;
  minAge?: number | null;
  maxAge?: number | null;
};

type ApiLesson = {
  id: string;
  title: string;
  description?: string | null;
  groupId?: string | null;
  sessionId?: string | null;
  group?: ApiLessonGroup | null;
  groupLabel?: string | null;
  ageGroupLabel?: string | null;
  tenantId?: string;
  weekOf?: string | null;
  fileKey?: string | null;
  resourceFileName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

const mapLessonStatus = (status?: string | null): AdminLessonRow["status"] => {
  if (status === "draft" || status === "published" || status === "archived") {
    return status;
  }
  return "unknown";
};

const resourceLabelFromKey = (key?: string | null) => {
  if (!key) return "Resource";
  const parts = key.split("/");
  const last = parts.pop();
  return last || key;
};

/** Derive age group label from group (e.g. "6–8" or group name). */
function lessonAgeGroupLabel(
  group: ApiLessonGroup | null | undefined,
): string | null {
  if (!group) return null;
  if (group.minAge != null && group.maxAge != null) {
    return `${group.minAge}–${group.maxAge}`;
  }
  return group.name;
}

const mapApiLessonToAdminRow = (api: ApiLesson): AdminLessonRow => ({
  id: api.id,
  title: api.title,
  ageGroupLabel: lessonAgeGroupLabel(api.group) ?? api.ageGroupLabel ?? null,
  groupLabel: api.group?.name ?? api.groupLabel ?? api.groupId ?? null,
  status: mapLessonStatus(api.status),
  updatedAt: api.updatedAt ?? api.createdAt ?? null,
});

const mapApiLessonToAdminDetail = (api: ApiLesson): AdminLessonDetail => ({
  id: api.id,
  title: api.title,
  description: api.description ?? null,
  ageGroupLabel: lessonAgeGroupLabel(api.group) ?? api.ageGroupLabel ?? null,
  groupLabel: api.group?.name ?? api.groupLabel ?? api.groupId ?? null,
  status: mapLessonStatus(api.status),
  updatedAt: api.updatedAt ?? api.createdAt ?? null,
  weekOf: api.weekOf ?? null,
  sessionId: api.sessionId ?? null,
  resourceFileName: api.resourceFileName ?? null,
  resources:
    api.resourceFileName || api.fileKey
      ? [
          {
            id: api.fileKey ?? api.resourceFileName ?? "resource",
            label: api.resourceFileName ?? resourceLabelFromKey(api.fileKey),
            type: null,
          },
        ]
      : [],
});

// LESSONS: content/curriculum only - no safeguarding notes or secrets. Do not expose raw S3 URLs or provider payloads; show safe labels only.
export async function fetchLessons(): Promise<AdminLessonRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return [
      {
        id: "l1",
        title: "Year 3 Maths - Fractions",
        ageGroupLabel: "Year 3",
        groupLabel: "3A",
        status: "published",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "l2",
        title: "Year 4 Science - Habitats",
        ageGroupLabel: "Year 4",
        groupLabel: "4B",
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  const res = await fetch(`${API_BASE_URL}/lessons`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch lessons: ${res.status} ${body}`);
  }

  const json = (await res.json()) as ApiLesson[];
  return json.map(mapApiLessonToAdminRow);
}

export async function fetchLessonById(
  lessonId: string,
): Promise<AdminLessonDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return {
      id: lessonId,
      title: "Mock lesson",
      description: "This is a mock lesson description.",
      ageGroupLabel: "Year 3",
      groupLabel: "3A",
      status: "draft",
      updatedAt: new Date().toISOString(),
      resources: [
        { id: "res1", label: "Mock worksheet.pdf", type: "pdf" },
        { id: "res2", label: "Slides.pptx", type: "ppt" },
      ],
    };
  }

  const res = await fetch(`${API_BASE_URL}/lessons/${lessonId}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch lesson: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiLesson;
  return mapApiLessonToAdminDetail(json);
}

// CreateLessonDto fields: tenantId, title, description?, fileKey?, groupId?, weekOf (date), resourceFileBase64?, resourceFileName?
export async function createLesson(
  input: AdminLessonFormValues,
): Promise<AdminLessonDetail> {
  const payload = {
    tenantId: input.tenantId ?? getDefaultTenantId(),
    title: input.title?.trim(),
    description: input.description?.trim() || undefined,
    fileKey: input.fileKey || undefined,
    groupId: input.groupId || undefined,
    sessionId: input.sessionId ?? undefined,
    weekOf: input.weekOf,
    ...(input.resourceFileBase64
      ? {
          resourceFileBase64: input.resourceFileBase64,
          resourceFileName: input.resourceFileName || undefined,
        }
      : {}),
  };

  const res = await fetch(`${API_BASE_URL}/lessons`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create lesson (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiLesson;
  return mapApiLessonToAdminDetail(json);
}

// UpdateLessonDto fields: title?, description?, fileKey?, groupId?, weekOf?, resourceFileBase64?, resourceFileName?
export async function updateLesson(
  id: string,
  input: Partial<AdminLessonFormValues>,
): Promise<AdminLessonDetail> {
  const payload = {
    ...(input.title ? { title: input.title.trim() } : {}),
    ...(input.description ? { description: input.description.trim() } : {}),
    ...(input.fileKey ? { fileKey: input.fileKey } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.weekOf ? { weekOf: input.weekOf } : {}),
    ...(input.resourceFileBase64 !== undefined
      ? {
          resourceFileBase64: input.resourceFileBase64,
          resourceFileName: input.resourceFileName ?? null,
        }
      : {}),
  };

  const res = await fetch(`${API_BASE_URL}/lessons/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to update lesson (${res.status}): ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiLesson;
  return mapApiLessonToAdminDetail(json);
}

/** Download the lesson resource file (stored as bytes until S3). Triggers browser download. */
export async function downloadLessonResource(lessonId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/lessons/${lessonId}/resource`, {
    method: "GET",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No resource file for this lesson.");
    }
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to download resource (${res.status}): ${body || res.statusText}`,
    );
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="?([^";\n]+)"?/);
  const fileName = match?.[1]?.trim() || "resource";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const mapAttendanceStatus = (
  present: boolean | null,
): "present" | "absent" | "late" | "unknown" => {
  if (present === true) return "present";
  if (present === false) return "absent";
  return "unknown";
};

/** API response for GET /attendance/session-summaries */
type ApiAttendanceSessionSummary = {
  sessionId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  groupIds: string[];
  ageGroupLabel: string | null;
  markedCount: number;
  totalChildCount: number;
  status: "not_started" | "in_progress" | "complete";
};

/**
 * Fetch attendance session summaries for a date range (for list page).
 * Use for "This week" / prev/next week.
 */
export async function fetchAttendanceSessionSummaries(
  from: string,
  to: string,
): Promise<AdminAttendanceRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) {
    return [
      {
        id: "s1",
        sessionId: "s1",
        title: "Year 3 Maths",
        date: new Date().toISOString(),
        timeRangeLabel: "09:00 - 09:50",
        roomLabel: "Room 12",
        ageGroupLabel: "Year 3",
        attendanceMarked: 18,
        attendanceTotal: 24,
        status: "in_progress",
      },
    ];
  }

  const params = new URLSearchParams({ from, to });
  const res = await fetch(
    `${API_BASE_URL}/attendance/session-summaries?${params}`,
    { headers: buildAuthHeaders(), credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch attendance summaries: ${res.status} ${body}`,
    );
  }
  const data = (await res.json()) as ApiAttendanceSessionSummary[];
  return data.map((s) => ({
    id: s.sessionId,
    sessionId: s.sessionId,
    title: s.title ?? "Session",
    date: s.startsAt,
    timeRangeLabel: buildTimeRangeLabel(s.startsAt, s.endsAt) ?? "Time TBC",
    roomLabel: null,
    ageGroupLabel: s.ageGroupLabel ?? null,
    attendanceMarked: s.markedCount,
    attendanceTotal: s.totalChildCount,
    status: s.status === "complete" ? "completed" : s.status,
  }));
}

/** Fetch summaries for today only (convenience: uses today's date range). */
export async function fetchAttendanceSummariesForToday(): Promise<
  AdminAttendanceRow[]
> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return fetchAttendanceSessionSummaries(from.toISOString(), to.toISOString());
}

/** API response for GET /attendance/session/:sessionId */
type ApiAttendanceSessionDetail = {
  session: {
    id: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    groupIds: string[];
    ageGroupLabel: string | null;
  };
  children: Array<{ id: string; displayName: string }>;
  rows: Array<{
    id?: string;
    childId: string;
    present: boolean | null;
    timestamp?: string;
  }>;
};

export async function fetchAttendanceDetailBySessionId(
  sessionId: string,
): Promise<AdminAttendanceDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    return {
      sessionId,
      title: "Year 3 Maths",
      date: new Date().toISOString(),
      timeRangeLabel: "09:00 - 09:50",
      roomLabel: "Room 12",
      ageGroupLabel: "Year 3",
      rows: [
        { childId: "c1", childName: "Amara Patel", status: "present" },
        { childId: "c2", childName: "Leo Williams", status: "absent" },
      ],
      summary: { present: 1, absent: 1, late: 0, unknown: 0 },
      status: "in_progress",
    };
  }

  const res = await fetch(
    `${API_BASE_URL}/attendance/session/${encodeURIComponent(sessionId)}`,
    { headers: buildAuthHeaders(), credentials: "include", cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch attendance detail: ${res.status} ${body}`);
  }

  const data = (await res.json()) as ApiAttendanceSessionDetail;
  const { session, children, rows: rawRows } = data;
  const childMap = new Map(children.map((c) => [c.id, c.displayName]));
  const rowsByChild = new Map(rawRows.map((r) => [r.childId, r.present]));

  const rows = children.map((c) => {
    const present = rowsByChild.get(c.id);
    const status = mapAttendanceStatus(present ?? null);
    return {
      childId: c.id,
      childName: childMap.get(c.id) ?? `Child ${c.id}`,
      status,
    };
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, unknown: 0 },
  );

  const timeRangeLabel =
    buildTimeRangeLabel(session.startsAt, session.endsAt) ?? "Time TBC";

  return {
    sessionId: session.id,
    title: session.title ?? "Session",
    date: session.startsAt,
    timeRangeLabel,
    roomLabel: null,
    ageGroupLabel: session.ageGroupLabel ?? null,
    rows,
    summary,
    status: mapSessionStatus(session.startsAt, session.endsAt),
  };
}

/** Payload for saving attendance: childId + status (present/absent/late/unknown). */
export type SaveAttendanceRow = {
  childId: string;
  status: "present" | "absent" | "late" | "unknown";
};

/**
 * Save attendance for a session. Requires real API (no mock).
 * Maps status to present: only "present" -> true, else false.
 */
export async function saveAttendanceForSession(
  sessionId: string,
  rows: SaveAttendanceRow[],
): Promise<AdminAttendanceDetail> {
  if (isUsingMockApi()) {
    throw new Error(
      "Cannot save attendance: API base URL is not set. Set NEXT_PUBLIC_API_URL.",
    );
  }
  const payload = {
    rows: rows.map((r) => ({
      childId: r.childId,
      present: r.status === "present",
    })),
  };
  const res = await fetch(
    `${API_BASE_URL}/attendance/session/${encodeURIComponent(sessionId)}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to save attendance: ${res.status} ${body}`);
  }
  const data = (await res.json()) as ApiAttendanceSessionDetail;
  const { session, children, rows: rawRows } = data;
  const rowsByChild = new Map(rawRows.map((r) => [r.childId, r.present]));
  const detailRows = children.map((c) => ({
    childId: c.id,
    childName: c.displayName,
    status: mapAttendanceStatus(rowsByChild.get(c.id) ?? null),
  }));
  const summary = detailRows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, unknown: 0 },
  );
  return {
    sessionId: session.id,
    title: session.title ?? "Session",
    date: session.startsAt,
    timeRangeLabel:
      buildTimeRangeLabel(session.startsAt, session.endsAt) ?? "Time TBC",
    roomLabel: null,
    ageGroupLabel: session.ageGroupLabel ?? null,
    rows: detailRows,
    summary,
    status: mapSessionStatus(session.startsAt, session.endsAt),
  };
}

type ApiConcern = {
  id: string;
  childId?: string | null;
  child?: { firstName?: string | null; lastName?: string | null } | null;
  createdAt?: string;
  updatedAt?: string | null;
  status?: string | null;
  category?: string | null;
  summary?: string | null;
  details?: string | null;
  reportedByLabel?: string | null;
};

const safeReporterLabel = (label?: string | null) => {
  if (!label) return "Staff member";
  if (label.includes("@")) return "Staff member";
  return label;
};

const mapApiConcernToAdmin = (c: ApiConcern): AdminConcernRow => ({
  id: c.id,
  createdAt: c.createdAt ?? new Date().toISOString(),
  updatedAt: c.updatedAt ?? null,
  status:
    c.status === "open" || c.status === "in_review" || c.status === "closed"
      ? c.status
      : "other",
  category: c.category ?? null,
  // SAFEGUARDING: show initials/generic labels only, never full names or free text.
  childLabel: safeChildLabel(c.childId, c.child ?? null),
  reportedByLabel: safeReporterLabel(c.reportedByLabel),
});

const mapApiConcernToDetail = (c: ApiConcern): AdminConcernDetail => ({
  id: c.id,
  createdAt: c.createdAt ?? new Date().toISOString(),
  updatedAt: c.updatedAt ?? null,
  status:
    c.status === "open" || c.status === "in_review" || c.status === "closed"
      ? c.status
      : "other",
  category: c.category ?? null,
  summary: c.summary ?? null,
  childLabel: safeChildLabel(c.childId, c.child ?? null),
  details: c.details ?? null,
});

// SAFEGUARDING: used for metadata-only overviews. Never expose concern/note free text to admin UI.
export async function fetchOpenConcerns(): Promise<AdminConcernRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return [
      {
        id: "concern-1",
        createdAt: new Date().toISOString(),
        updatedAt: null,
        status: "open",
        category: "Safeguarding",
        childLabel: "Child record",
        reportedByLabel: "Staff member",
      },
    ];
  }

  const res = await fetch(`${API_BASE_URL}/concerns`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch concerns: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiConcern[];

  return json
    .filter((c) => (c.status ?? "open") !== "closed") // basic open filter; backend filter preferred when available
    .map(mapApiConcernToAdmin)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/** Create a concern. Requires safeguarding admin role. */
export async function createConcern(payload: {
  childId: string;
  summary: string;
  details?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/concerns`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      childId: payload.childId,
      summary: payload.summary.trim(),
      ...(payload.details?.trim() ? { details: payload.details.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create concern (${res.status}): ${body || res.statusText}`,
    );
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

/** Submit admin feedback / a feature request. Emails support directly, no stored record. */
export async function submitFeedback(payload: {
  category: "bug" | "feature-request" | "other";
  subject: string;
  description: string;
  screenshotBase64?: string;
  screenshotContentType?: string;
  screenshotFilename?: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      category: payload.category,
      subject: payload.subject.trim(),
      description: payload.description.trim(),
      ...(payload.screenshotBase64
        ? {
            screenshotBase64: payload.screenshotBase64,
            screenshotContentType: payload.screenshotContentType,
            screenshotFilename: payload.screenshotFilename,
          }
        : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to submit feedback (${res.status}): ${body || res.statusText}`,
    );
  }
  return res.json();
}

/** Fetch a single concern by id for detail view. Returns null if not found. */
export async function fetchConcernById(
  id: string,
): Promise<AdminConcernDetail | null> {
  const res = await fetch(`${API_BASE_URL}/concerns/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch concern (${res.status}): ${body || res.statusText}`,
    );
  }
  const json = (await res.json()) as ApiConcern;
  return mapApiConcernToDetail(json);
}

/** Close a concern (soft delete). Requires safeguarding admin role. */
export async function closeConcern(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/concerns/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to close concern (${res.status}): ${body || res.statusText}`,
    );
  }
}

type ApiNote = {
  id: string;
  createdAt?: string;
  visibleToParents?: boolean;
};

// SAFEGUARDING: used for counts only; do not surface note text in admin UI.
export async function fetchNotesSummary(): Promise<AdminNotesSummary> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return { totalNotes: 2, visibleToParents: 0, staffOnly: 2 };
  }

  const res = await fetch(`${API_BASE_URL}/notes`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch notes: ${res.status} ${body || res.statusText}`,
    );
  }

  const notes = (await res.json()) as ApiNote[];
  const totalNotes = notes.length;
  const visibleToParents = notes.filter((n) => n.visibleToParents).length;
  const staffOnly = totalNotes - visibleToParents;

  return { totalNotes, visibleToParents, staffOnly };
}

/** Create a positive note (ChildNote). Requires safeguarding role. */
export async function createNote(payload: {
  childId: string;
  text: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/notes`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      childId: payload.childId,
      text: payload.text.trim(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to create note (${res.status}): ${body || res.statusText}`,
    );
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

type ApiEntitlements = {
  orgId: string;
  isMasterOrg?: boolean;
  subscriptionStatus?: string;
  subscription?: {
    planCode?: string | null;
    status?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
  } | null;
  av30Cap?: number | null;
  maxChildren?: number | null;
  currentAv30?: number | null;
  av30Enforcement?: {
    status: "OK" | "SOFT_CAP" | "GRACE" | "HARD_CAP";
    graceUntil: string | null;
    messageCode: string;
  };
  storageGbCap?: number | null;
  storageGbUsage?: number | null;
  smsMessagesCap?: number | null;
  smsMonthUsage?: number | null;
  leaderSeatsIncluded?: number | null;
  maxSites?: number | null;
  usageCalculatedAt?: string | null;
};

const mapApiEntitlementsToAdmin = (
  api: ApiEntitlements,
): AdminBillingOverview => ({
  orgId: api.orgId,
  isMasterOrg: api.isMasterOrg ?? false,
  subscriptionStatus: api.subscriptionStatus ?? "NONE",
  planCode: api.subscription?.planCode ?? null,
  periodStart: api.subscription?.periodStart ?? null,
  periodEnd: api.subscription?.periodEnd ?? null,
  cancelAtPeriodEnd: api.subscription?.cancelAtPeriodEnd ?? null,
  av30Cap: api.av30Cap ?? null,
  maxChildren: api.maxChildren ?? null,
  currentAv30: api.currentAv30 ?? null,
  av30Enforcement: api.av30Enforcement,
  storageGbCap: api.storageGbCap ?? null,
  storageGbUsage: api.storageGbUsage ?? null,
  smsMessagesCap: api.smsMessagesCap ?? null,
  smsMonthUsage: api.smsMonthUsage ?? null,
  leaderSeatsIncluded: api.leaderSeatsIncluded ?? null,
  maxSites: api.maxSites ?? null,
});

// BILLING: high-level entitlements only. Do NOT surface card details or billing addresses.
export async function fetchBillingOverview(): Promise<AdminBillingOverview> {
  const res = await fetch(`${API_BASE_URL}/billing/entitlements`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        "Billing not available for this organisation (no entitlements configured).",
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch billing: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as ApiEntitlements;
  return mapApiEntitlementsToAdmin(json);
}

const mapPreviewToAdmin = (api: {
  planCode: string | null;
  planTier: "core" | "starter" | "growth" | "enterprise" | null;
  base?: {
    av30Cap: number | null;
    maxSites: number | null;
    storageGbCap: number | null;
    smsMessagesCap: number | null;
    leaderSeatsIncluded: number | null;
  } | null;
  effectiveCaps?: {
    av30Cap: number | null;
    maxSites: number | null;
    storageGbCap: number | null;
    smsMessagesCap: number | null;
    leaderSeatsIncluded: number | null;
  } | null;
  warnings?: string[];
}): AdminPlanPreview => ({
  planCode: api.planCode ?? null,
  planTier: api.planTier ?? null,
  baseAv30Included: api.base?.av30Cap ?? null,
  effectiveAv30Cap: api.effectiveCaps?.av30Cap ?? null,
  baseSitesIncluded: api.base?.maxSites ?? null,
  effectiveSitesCap: api.effectiveCaps?.maxSites ?? null,
  baseStorageGbIncluded: api.base?.storageGbCap ?? null,
  effectiveStorageGbCap: api.effectiveCaps?.storageGbCap ?? null,
  baseSmsMessagesIncluded: api.base?.smsMessagesCap ?? null,
  effectiveSmsMessagesCap: api.effectiveCaps?.smsMessagesCap ?? null,
  baseLeaderSeatsIncluded: api.base?.leaderSeatsIncluded ?? null,
  effectiveLeaderSeatsIncluded: api.effectiveCaps?.leaderSeatsIncluded ?? null,
  warnings: api.warnings ?? [],
});

export async function previewPlanSelection(
  input: AdminPlanPreviewRequest,
): Promise<AdminPlanPreview> {
  const useMock = isUsingMockApi();
  if (useMock) {
    const planMeta: Record<
      string,
      {
        av30: number | null;
        sites: number | null;
        tier: AdminPlanPreview["planTier"];
      }
    > = {
      CORE_MONTHLY: { av30: 15, sites: 1, tier: "core" },
      CORE_YEARLY: { av30: 15, sites: 1, tier: "core" },
      STARTER_MONTHLY: { av30: 50, sites: 1, tier: "starter" },
      STARTER_YEARLY: { av30: 50, sites: 1, tier: "starter" },
      GROWTH_MONTHLY: { av30: 200, sites: 3, tier: "growth" },
      GROWTH_YEARLY: { av30: 200, sites: 3, tier: "growth" },
      ENTERPRISE_CONTACT: { av30: null, sites: null, tier: "enterprise" },
    };
    const meta = planMeta[input.planCode] ?? {
      av30: null,
      sites: null,
      tier: null,
    };
    const blocks = Math.max(0, Math.trunc(input.extraAv30Blocks ?? 0));
    const addonsAv30 = meta.av30 !== null ? blocks * 25 : null;
    return {
      planCode: input.planCode ?? null,
      planTier: meta.tier,
      baseAv30Included: meta.av30,
      effectiveAv30Cap:
        meta.av30 === null ? addonsAv30 : (meta.av30 ?? 0) + (addonsAv30 ?? 0),
      baseSitesIncluded: meta.sites,
      effectiveSitesCap:
        meta.sites === null
          ? Math.max(0, Math.trunc(input.extraSites ?? 0)) || null
          : (meta.sites ?? 0) + Math.max(0, Math.trunc(input.extraSites ?? 0)),
      baseStorageGbIncluded: null,
      effectiveStorageGbCap:
        input.extraStorageGb !== null && input.extraStorageGb !== undefined
          ? Math.max(0, Math.trunc(input.extraStorageGb))
          : null,
      baseSmsMessagesIncluded: null,
      effectiveSmsMessagesCap:
        input.extraSmsMessages !== null && input.extraSmsMessages !== undefined
          ? Math.max(0, Math.trunc(input.extraSmsMessages))
          : null,
      baseLeaderSeatsIncluded: null,
      effectiveLeaderSeatsIncluded:
        input.extraLeaderSeats !== null && input.extraLeaderSeats !== undefined
          ? Math.max(0, Math.trunc(input.extraLeaderSeats))
          : null,
      warnings: ["mock_mode", "price_not_included"],
    };
  }

  const res = await fetch(`${API_BASE_URL}/billing/plan-preview`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      planCode: input.planCode,
      addons: {
        extraAv30Blocks: input.extraAv30Blocks ?? 0,
        extraStorageGb: input.extraStorageGb ?? 0,
        extraSmsMessages: input.extraSmsMessages ?? 0,
        extraLeaderSeats: input.extraLeaderSeats ?? 0,
        extraSites: input.extraSites ?? 0,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to preview plan: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    planCode: string | null;
    planTier: "core" | "starter" | "growth" | "enterprise" | null;
    billingPeriod: string | null;
    base: {
      av30Cap: number | null;
      storageGbCap: number | null;
      smsMessagesCap: number | null;
      leaderSeatsIncluded: number | null;
      maxSites: number | null;
    };
    effectiveCaps: {
      av30Cap: number | null;
      storageGbCap: number | null;
      smsMessagesCap: number | null;
      leaderSeatsIncluded: number | null;
      maxSites: number | null;
    };
    notes?: { warnings?: string[] };
  };

  return mapPreviewToAdmin({
    planCode: json.planCode,
    planTier: json.planTier,
    base: {
      av30Cap: json.base?.av30Cap ?? null,
      maxSites: json.base?.maxSites ?? null,
      storageGbCap: json.base?.storageGbCap ?? null,
      smsMessagesCap: json.base?.smsMessagesCap ?? null,
      leaderSeatsIncluded: json.base?.leaderSeatsIncluded ?? null,
    },
    effectiveCaps: {
      av30Cap: json.effectiveCaps?.av30Cap ?? null,
      maxSites: json.effectiveCaps?.maxSites ?? null,
      storageGbCap: json.effectiveCaps?.storageGbCap ?? null,
      smsMessagesCap: json.effectiveCaps?.smsMessagesCap ?? null,
      leaderSeatsIncluded: json.effectiveCaps?.leaderSeatsIncluded ?? null,
    },
    warnings: json.notes?.warnings ?? [],
  });
}

/**
 * Fetches billing prices from GET /billing/prices. Returns null on failure so UI can fall back to catalogue placeholders.
 */
export async function fetchBillingPrices(): Promise<AdminBillingPrices | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    return {
      provider: "fake",
      prices: [],
      warnings: ["pricing_unavailable"],
    };
  }

  const res = await fetch(`${API_BASE_URL}/billing/prices`, {
    method: "GET",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as AdminBillingPrices;
}

export async function createBuyNowCheckout(
  input: AdminBuyNowCheckoutRequest,
): Promise<AdminBuyNowCheckoutResponse> {
  const useMock = isUsingMockApi();
  if (useMock) {
    return {
      sessionId: "mock-session",
      sessionUrl: "https://example.test/checkout/mock",
      warnings: ["mock_mode", "price_not_included"],
      preview: await previewPlanSelection(input),
    };
  }

  const res = await fetch(`${API_BASE_URL}/billing/buy-now/checkout`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      plan: {
        planCode: input.planCode,
        av30AddonBlocks: input.extraAv30Blocks ?? 0,
        extraStorageGb: input.extraStorageGb ?? 0,
        extraSmsMessages: input.extraSmsMessages ?? 0,
        extraLeaderSeats: input.extraLeaderSeats ?? 0,
        extraSites: input.extraSites ?? 0,
      },
      org: {
        orgName: input.org.orgName,
        contactName: input.org.contactName,
        contactEmail: input.org.contactEmail,
        source: input.org.notes ?? undefined,
      },
      successUrl: input.successUrl ?? undefined,
      cancelUrl: input.cancelUrl ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to start checkout: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    sessionId: string;
    sessionUrl: string;
    warnings?: string[];
    preview?: {
      planCode: string | null;
      planTier: "core" | "starter" | "growth" | "enterprise" | null;
      billingPeriod: string | null;
      av30Cap: number | null;
      maxChildren: number | null;
      maxSites: number | null;
      storageGbCap: number | null;
      smsMessagesCap: number | null;
      leaderSeatsIncluded: number | null;
      source: string | null;
    };
  };

  return {
    sessionId: json.sessionId,
    sessionUrl: json.sessionUrl,
    warnings: json.warnings ?? [],
    preview: json.preview
      ? mapPreviewToAdmin({
          planCode: json.preview.planCode,
          planTier: json.preview.planTier,
          base: {
            av30Cap: null,
            maxSites: null,
            storageGbCap: null,
            smsMessagesCap: null,
            leaderSeatsIncluded: null,
          },
          effectiveCaps: {
            av30Cap: json.preview.av30Cap,
            maxSites: json.preview.maxSites,
            storageGbCap: json.preview.storageGbCap,
            smsMessagesCap: json.preview.smsMessagesCap,
            leaderSeatsIncluded: json.preview.leaderSeatsIncluded,
          },
          warnings: json.warnings ?? [],
        })
      : undefined,
  };
}

/**
 * Authenticated purchase for existing org admins (upgrade page).
 * Uses session org; no org details or password required.
 */
export async function createBuyNowPurchase(
  input: AdminBuyNowPurchaseRequest,
): Promise<AdminBuyNowCheckoutResponse> {
  const useMock = isUsingMockApi();
  if (useMock) {
    return {
      sessionId: "mock-purchase-session",
      sessionUrl: "https://example.test/checkout/mock",
      warnings: ["mock_mode", "price_not_included"],
      preview: await previewPlanSelection({
        planCode: input.planCode,
        extraAv30Blocks: input.extraAv30Blocks ?? 0,
        extraStorageGb: input.extraStorageGb ?? 0,
        extraSmsMessages: input.extraSmsMessages ?? 0,
        extraLeaderSeats: input.extraLeaderSeats ?? 0,
        extraSites: input.extraSites ?? 0,
      }),
    };
  }

  const res = await fetch(`${API_BASE_URL}/billing/buy-now/purchase`, {
    method: "POST",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify({
      planCode: input.planCode,
      successUrl: input.successUrl ?? undefined,
      cancelUrl: input.cancelUrl ?? undefined,
      av30AddonBlocks: input.extraAv30Blocks ?? 0,
      extraSites: input.extraSites ?? 0,
      extraStorageGb: input.extraStorageGb ?? 0,
      extraSmsMessages: input.extraSmsMessages ?? 0,
      extraLeaderSeats: input.extraLeaderSeats ?? 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to start checkout: ${res.status} ${body || res.statusText}`,
    );
  }

  const json = (await res.json()) as {
    sessionId: string;
    sessionUrl: string;
    warnings?: string[];
    preview?: {
      planCode: string | null;
      planTier: "core" | "starter" | "growth" | "enterprise" | null;
      billingPeriod: string | null;
      av30Cap: number | null;
      maxChildren: number | null;
      maxSites: number | null;
      storageGbCap: number | null;
      smsMessagesCap: number | null;
      leaderSeatsIncluded: number | null;
      source: string | null;
    };
  };

  return {
    sessionId: json.sessionId,
    sessionUrl: json.sessionUrl,
    warnings: json.warnings ?? [],
    preview: json.preview
      ? mapPreviewToAdmin({
          planCode: json.preview.planCode,
          planTier: json.preview.planTier,
          base: {
            av30Cap: null,
            maxSites: null,
            storageGbCap: null,
            smsMessagesCap: null,
            leaderSeatsIncluded: null,
          },
          effectiveCaps: {
            av30Cap: json.preview.av30Cap,
            maxSites: json.preview.maxSites,
            storageGbCap: json.preview.storageGbCap,
            smsMessagesCap: json.preview.smsMessagesCap,
            leaderSeatsIncluded: json.preview.leaderSeatsIncluded,
          },
          warnings: json.warnings ?? [],
        })
      : undefined,
  };
}

type ApiOrg = {
  id: string;
  name: string;
  slug?: string | null;
  planCode?: string | null;
  isSuite?: boolean | null;
  parentPortalEnabled?: boolean | null;
  sector?: AdminOrgSector | null;
  logoUrl?: string | null;
  // TODO: map site counts when available
};

const mapApiOrgToAdmin = (org: ApiOrg): AdminOrgOverview => ({
  id: org.id,
  name: org.name,
  slug: org.slug ?? null,
  isMultiSite: Boolean(org.isSuite), // TODO: confirm multi-site flag mapping
  parentPortalEnabled: org.parentPortalEnabled ?? true,
  planTier: org.planCode ?? null,
  siteCount: null,
  sector: org.sector ?? null,
  logoUrl: org.logoUrl ?? null,
});

// SETTINGS: org overview is metadata-only; do not surface secrets or API keys here.
export async function fetchOrgOverview(): Promise<AdminOrgOverview> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock once admin env is always configured.
    return {
      id: "mock-org",
      name: "Mock Organisation",
      slug: "mock-org",
      isMultiSite: false,
      parentPortalEnabled: true,
      planTier: null,
      siteCount: null,
    };
  }

  const res = await fetch(`${API_BASE_URL}/orgs`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch org: ${res.status} ${body}`);
  }

  const json = (await res.json()) as ApiOrg[];
  const firstOrg = json[0];
  if (!firstOrg) {
    return {
      id: "unknown",
      name: "Organisation",
      slug: null,
      isMultiSite: false,
      parentPortalEnabled: true,
      planTier: null,
      siteCount: null,
    };
  }

  return mapApiOrgToAdmin(firstOrg);
}

/** Update current organisation profile. ORG_ADMIN only. */
export async function updateOrgProfile(input: {
  name?: string;
  parentPortalEnabled?: boolean;
}): Promise<AdminOrgOverview> {
  if (isUsingMockApi()) {
    throw new Error("Organisation updates are not available in mock mode.");
  }
  const body: { name?: string; parentPortalEnabled?: boolean } = {};
  if (input.name !== undefined) {
    body.name = input.name.trim();
  }
  if (input.parentPortalEnabled !== undefined) {
    body.parentPortalEnabled = input.parentPortalEnabled;
  }
  const res = await fetch(`${API_BASE_URL}/orgs/current`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update org: ${res.status} ${body}`);
  }
  const json = (await res.json()) as ApiOrg;
  return mapApiOrgToAdmin(json);
}

/** Upload/replace the current org's white-label logo. ORG_ADMIN only. */
export async function uploadOrgLogo(
  logoBase64: string,
  logoContentType?: string,
): Promise<{ logoUrl: string | null }> {
  if (isUsingMockApi()) {
    throw new Error("Logo upload is not available in mock mode.");
  }
  const res = await fetch(`${API_BASE_URL}/orgs/current/logo`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ logoBase64, logoContentType }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to upload logo: ${res.status} ${body}`);
  }
  return (await res.json()) as { logoUrl: string | null };
}

/** Revert the current org's logo to the default NexSteps mark. ORG_ADMIN only. */
export async function deleteOrgLogo(): Promise<{ logoUrl: null }> {
  if (isUsingMockApi()) {
    throw new Error("Logo removal is not available in mock mode.");
  }
  const res = await fetch(`${API_BASE_URL}/orgs/current/logo`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to remove logo: ${res.status} ${body}`);
  }
  return (await res.json()) as { logoUrl: null };
}

export type AdminSiteProfile = {
  id: string;
  name: string;
  slug: string;
  timezone: string | null;
};

/** Update tenant (site) profile. SITE_ADMIN for site or ORG_ADMIN required. */
export async function updateSiteProfile(input: {
  siteId: string;
  name?: string;
  timezone?: string;
}): Promise<AdminSiteProfile> {
  if (isUsingMockApi()) {
    throw new Error("Site updates are not available in mock mode.");
  }
  const body: { name?: string; timezone?: string } = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.timezone !== undefined) body.timezone = input.timezone;
  const res = await fetch(
    `${API_BASE_URL}/tenants/${encodeURIComponent(input.siteId)}`,
    {
      method: "PATCH",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to update site: ${res.status} ${text}`);
  }
  return res.json() as Promise<AdminSiteProfile>;
}

// SETTINGS: high-level retention config only; detailed policy text belongs in docs, not raw JSON here.
export async function fetchRetentionOverview(): Promise<AdminRetentionOverview | null> {
  if (isUsingMockApi()) {
    return null;
  }
  const res = await fetch(`${API_BASE_URL}/orgs/current/retention`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as {
    attendanceRetentionYears?: number | null;
    safeguardingRetentionYears?: number | null;
    notesRetentionYears?: number | null;
  };
  return {
    attendanceRetentionYears: json.attendanceRetentionYears ?? null,
    safeguardingRetentionYears: json.safeguardingRetentionYears ?? null,
    notesRetentionYears: json.notesRetentionYears ?? null,
  };
}

export type AdminOrgExport = {
  orgName: string;
  slug: string;
  sites: { name: string }[];
};

export async function requestExportOrganisationData(): Promise<AdminOrgExport> {
  if (isUsingMockApi()) {
    throw new Error("Export is not available in mock mode.");
  }
  const res = await fetch(`${API_BASE_URL}/orgs/export`, {
    method: "GET",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 501
        ? "Export is not available yet."
        : `Export failed: ${res.status} ${body}`,
    );
  }
  return res.json() as Promise<AdminOrgExport>;
}

export async function deactivateOrganisation(): Promise<void> {
  if (isUsingMockApi()) {
    throw new Error("Deactivation is not available in mock mode.");
  }
  const res = await fetch(`${API_BASE_URL}/orgs/deactivate`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      const json = JSON.parse(text) as { message?: string };
      if (json?.message) msg = json.message;
    } catch {
      // use text as-is
    }
    throw new Error(msg || `Deactivation failed: ${res.status}`);
  }
}

type ApiUser = {
  id: string;
  email: string | null;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  hasServeAccess?: boolean | null;
  hasFamilyAccess?: boolean | null;
  status?: string | null;
  createdAt?: string;
  groups?: { id: string; name: string }[] | null;
  sessionsCount?: number | null;
  assignmentsSummary?: {
    total?: number;
    confirmed?: number;
    pending?: number;
    declined?: number;
  } | null;
  assignments?: Array<{
    sessionId?: string;
    sessionTitle?: string;
    startsAt?: string;
    role?: string;
    status?: string;
  }> | null;
};

const mapUserToStaffRow = (u: ApiUser): AdminStaffRow => {
  const roles: string[] = [];
  if (u.hasServeAccess) roles.push("Staff access");
  if (u.hasFamilyAccess) roles.push("Family access");
  const fullName =
    u.name ||
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
    "Unknown user";
  return {
    id: u.id,
    fullName,
    email: u.email,
    rolesLabel: roles.length ? roles.join(", ") : "-",
    status:
      u.status === "inactive"
        ? "inactive"
        : u.status === "active" || u.status === undefined || u.status === null
          ? "active"
          : "unknown",
  };
};

const mapUserToStaffDetail = (u: ApiUser): AdminStaffDetail => {
  const roles: string[] = [];
  if (u.hasServeAccess) roles.push("Staff access");
  if (u.hasFamilyAccess) roles.push("Family access");
  const fullName =
    u.name ||
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
    "Unknown user";
  return {
    id: u.id,
    fullName,
    email: u.email,
    roles,
    primaryRoleLabel: roles[0] ?? null,
    status:
      u.status === "inactive"
        ? "inactive"
        : u.status === "active" || u.status === undefined || u.status === null
          ? "active"
          : "unknown",
    groups: u.groups ?? undefined,
    sessionsCount: u.sessionsCount ?? undefined,
    assignmentsSummary: u.assignmentsSummary ?? undefined,
    assignments: u.assignments ?? undefined,
  };
};

// PEOPLE: high-level staff metadata only. No auth tokens or logs.
export async function fetchStaff(): Promise<AdminStaffRow[]> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return [
      {
        id: "u1",
        fullName: "Alex Morgan",
        email: "alex.morgan@example.edu",
        rolesLabel: "Staff access",
        status: "active",
      },
      {
        id: "u2",
        fullName: "Jamie Lee",
        email: "jamie.lee@example.edu",
        rolesLabel: "Family access",
        status: "active",
      },
    ];
  }

  const res = await fetch(`${API_BASE_URL}/users`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch users: ${res.status} ${body}`);
  }

  const json = (await res.json()) as ApiUser[];
  return json.map(mapUserToStaffRow);
}

export type StaffEditDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  displayName?: string | null;
  email: string | null;
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
  role: string;
  isActive: boolean;
  weeklyAvailability: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  unavailableDates: { date: string; reason: string | null }[];
  preferredGroups: { id: string; name: string }[];
  canEditAvailability: boolean;
  hasServeAccess?: boolean;
  children?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    group: { name: string } | null;
  }[];
};

export type StaffProfileDetail = StaffEditDetail & {
  displayName: string | null;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  hasAvatar: boolean;
  assignments: {
    id: string;
    status: string;
    session: {
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      groups: { id: string; name: string }[];
      attendanceMarked?: number;
      attendanceTotal?: number;
    };
  }[];
  children: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    group: { name: string } | null;
  }[];
};

export type StaffProfileUpdatePayload = {
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  dateOfBirth?: string | null;
  weeklyAvailability?: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  unavailableDates?: { date: string; reason?: string }[];
  preferredGroupIds?: string[];
};

export type StaffEditUpdatePayload = {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  hasServeAccess?: boolean;
  role?: "SITE_ADMIN" | "STAFF" | "VIEWER";
  isActive?: boolean;
  weeklyAvailability?: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  unavailableDates?: { date: string; reason?: string }[];
  preferredGroupIds?: string[];
};

export async function fetchStaffDetailForEdit(
  userId: string,
): Promise<StaffEditDetail | null> {
  if (isUsingMockApi()) {
    return {
      id: userId,
      firstName: "Alex",
      lastName: "Morgan",
      fullName: "Alex Morgan",
      email: "alex.morgan@example.edu",
      role: "STAFF",
      isActive: true,
      weeklyAvailability: [
        { day: "MON", startTime: "09:00", endTime: "12:00" },
        { day: "MON", startTime: "14:00", endTime: "17:00" },
      ],
      unavailableDates: [],
      preferredGroups: [],
      canEditAvailability: true,
      hasServeAccess: false,
      children: [],
    };
  }

  const res = await fetch(`${API_BASE_URL}/staff/${userId}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch staff: ${res.status} ${body}`);
  }

  return (await res.json()) as StaffEditDetail;
}

export async function fetchStaffProfile(): Promise<StaffProfileDetail> {
  if (isUsingMockApi()) {
    return {
      id: "current",
      firstName: "Alex",
      lastName: "Morgan",
      fullName: "Alex Morgan",
      displayName: "Alex",
      email: "alex.morgan@example.edu",
      dateOfBirth: null,
      avatarUrl: null,
      hasAvatar: false,
      role: "STAFF",
      isActive: true,
      weeklyAvailability: [
        { day: "MON", startTime: "09:00", endTime: "12:00" },
        { day: "MON", startTime: "14:00", endTime: "17:00" },
      ],
      unavailableDates: [],
      preferredGroups: [
        { id: "g1", name: "Year 3" },
        { id: "g2", name: "Year 4" },
      ],
      canEditAvailability: true,
      assignments: [
        {
          id: "a1",
          status: "CONFIRMED",
          session: {
            id: "s1",
            title: "Year 3 Maths",
            startsAt: "2025-02-17T09:00:00Z",
            endsAt: "2025-02-17T10:00:00Z",
            groups: [{ id: "g1", name: "Year 3" }],
            attendanceMarked: 18,
            attendanceTotal: 18,
          },
        },
        {
          id: "a2",
          status: "PENDING",
          session: {
            id: "s2",
            title: "Reception Assembly",
            startsAt: "2025-02-18T10:00:00Z",
            endsAt: "2025-02-18T11:00:00Z",
            groups: [{ id: "g0", name: "Reception" }],
            attendanceMarked: 0,
            attendanceTotal: 12,
          },
        },
      ],
      children: [
        { id: "c1", firstName: "Sam", lastName: "Morgan", preferredName: "Sammy", group: { name: "Year 3" } },
      ],
    };
  }

  const res = await fetch(`${API_BASE_URL}/staff/profile`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch profile: ${res.status} ${body}`);
  }

  return (await res.json()) as StaffProfileDetail;
}

export async function updateStaffProfile(
  payload: StaffProfileUpdatePayload,
): Promise<StaffEditDetail> {
  if (isUsingMockApi()) {
    const current = await fetchStaffProfile();
    return {
      ...current,
      firstName: payload.firstName ?? current.firstName,
      lastName: payload.lastName ?? current.lastName,
      displayName: payload.displayName ?? current.displayName,
      dateOfBirth: payload.dateOfBirth ?? current.dateOfBirth,
    };
  }

  const res = await fetch(`${API_BASE_URL}/staff/profile`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update profile: ${res.status} ${body}`);
  }

  return (await res.json()) as StaffEditDetail;
}

/** Upload avatar image. Accepts base64-encoded image data. */
export async function uploadStaffAvatar(
  photoBase64: string,
  photoContentType?: string | null,
): Promise<void> {
  if (isUsingMockApi()) {
    return;
  }

  const res = await fetch(`${API_BASE_URL}/staff/profile/avatar`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      photoBase64,
      photoContentType: photoContentType ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to upload avatar: ${res.status} ${body}`);
  }
}

export async function updateStaff(
  userId: string,
  payload: StaffEditUpdatePayload,
): Promise<StaffEditDetail> {
  if (isUsingMockApi()) {
    const current = await fetchStaffDetailForEdit(userId);
    if (!current) throw new Error("Staff not found");
    return {
      ...current,
      firstName: payload.firstName ?? current.firstName,
      lastName: payload.lastName ?? current.lastName,
      isActive: payload.isActive ?? current.isActive,
      role: payload.role ?? current.role,
    };
  }

  const res = await fetch(`${API_BASE_URL}/staff/${userId}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update staff: ${res.status} ${body}`);
  }

  return (await res.json()) as StaffEditDetail;
}

export type GroupOption = {
  id: string;
  name: string;
};

/** Fetch groups; use activeOnly: true for session creation / staff preference pickers */
export async function fetchGroups(options?: {
  activeOnly?: boolean;
}): Promise<GroupOption[]> {
  if (isUsingMockApi()) {
    return [
      { id: "g1", name: "Year 3" },
      { id: "g2", name: "Year 4" },
      { id: "g3", name: "Year 5" },
    ];
  }

  const params = new URLSearchParams();
  if (options?.activeOnly) params.set("activeOnly", "true");
  const qs = params.toString();
  const url = `${API_BASE_URL}/groups${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch groups: ${res.status} ${body}`);
  }

  const json = (await res.json()) as GroupOption[];
  return json;
}

// --- Handover logs ---

export type HandoverLogSummary = {
  id: string;
  groupId: string;
  handoverDate: string;
  status: HandoverLogStatus;
};

export async function fetchMyNextHandover(): Promise<MyNextHandoverResponse> {
  if (isUsingMockApi()) {
    return { available: false };
  }
  const res = await fetch(`${API_BASE_URL}/handover/my-next`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch handover: ${res.status} ${body}`);
  }
  return (await res.json()) as MyNextHandoverResponse;
}

export type HandoverForSessionResponse = {
  handoverLogId: string | null;
  status?: string;
};

export async function fetchHandoverForSession(
  sessionId: string,
): Promise<HandoverForSessionResponse> {
  if (isUsingMockApi()) {
    return { handoverLogId: null };
  }
  const res = await fetch(
    `${API_BASE_URL}/handover/for-session/${encodeURIComponent(sessionId)}`,
    { headers: buildAuthHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch handover for session: ${res.status} ${body}`);
  }
  return (await res.json()) as HandoverForSessionResponse;
}

export type StaffHandoverDetail = {
  id: string;
  groupId: string;
  handoverDate: string;
  status: HandoverLogStatus;
  currentContentJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export async function fetchHandoverById(
  id: string,
): Promise<StaffHandoverDetail> {
  if (isUsingMockApi()) {
    throw new Error("Handover detail requires real API.");
  }
  const res = await fetch(`${API_BASE_URL}/handover/${encodeURIComponent(id)}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch handover: ${res.status} ${body}`);
  }
  return (await res.json()) as StaffHandoverDetail;
}

export type AdminHandoverListItem = {
  id: string;
  tenantId: string;
  groupId: string;
  handoverDate: string;
  status: HandoverLogStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHandoverListFilters = {
  date?: string;
  groupId?: string;
  status?: HandoverLogStatus;
};

export async function fetchAdminHandoverLogs(
  filters: AdminHandoverListFilters = {},
): Promise<AdminHandoverListItem[]> {
  if (isUsingMockApi()) {
    return [];
  }

  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.status) params.set("status", filters.status);

  const qs = params.toString();
  const url = `${API_BASE_URL}/admin/handover${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to view handover logs for this site. (403)"
        : `Failed to fetch handover logs: ${res.status}${
            body ? ` ${body}` : ""
          }`,
    );
  }

  const json = (await res.json()) as AdminHandoverListItem[];
  return json;
}

export type AdminHandoverDetail = {
  id: string;
  tenantId: string;
  groupId: string;
  handoverDate: string;
  status: HandoverLogStatus;
  currentContentJson: unknown;
  createdByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHandoverVersion = {
  id: string;
  versionNumber: number;
  contentSnapshotJson: unknown;
  editedByUserId: string;
  editedAt: string;
  changeSummary: string | null;
  diffJson: unknown;
};

export async function fetchAdminHandoverDetail(
  id: string,
): Promise<AdminHandoverDetail> {
  if (isUsingMockApi()) {
    throw new Error("Handover admin detail requires real API.");
  }

  const res = await fetch(`${API_BASE_URL}/admin/handover/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to view this handover. (403)"
        : res.status === 404
          ? "Handover log not found."
          : `Failed to load handover: ${res.status}${body ? ` ${body}` : ""}`,
    );
  }

  return (await res.json()) as AdminHandoverDetail;
}

export async function fetchAdminHandoverVersions(
  id: string,
): Promise<AdminHandoverVersion[]> {
  if (isUsingMockApi()) {
    return [];
  }

  const res = await fetch(
    `${API_BASE_URL}/admin/handover/${encodeURIComponent(id)}/versions`,
    {
      method: "GET",
      headers: buildAuthHeaders(),
      credentials: "include",
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to view versions for this handover. (403)"
        : `Failed to load versions: ${res.status}${body ? ` ${body}` : ""}`,
    );
  }

  return (await res.json()) as AdminHandoverVersion[];
}

export async function approveAdminHandover(
  id: string,
  changeSummary?: string,
): Promise<AdminHandoverDetail> {
  if (isUsingMockApi()) {
    throw new Error("Handover admin approve requires real API.");
  }

  const payload = changeSummary ? { changeSummary } : {};

  const res = await fetch(
    `${API_BASE_URL}/admin/handover/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to approve this handover. (403)"
        : `Failed to approve handover: ${res.status}${
            body ? ` ${body}` : ""
          }`,
    );
  }

  return (await res.json()) as AdminHandoverDetail;
}

export async function rejectAdminHandover(
  id: string,
  reason: string,
  status: "DRAFT" | "PENDING_APPROVAL" = "DRAFT",
): Promise<AdminHandoverDetail> {
  if (isUsingMockApi()) {
    throw new Error("Handover admin reject requires real API.");
  }

  const payload = { reason, status };

  const res = await fetch(
    `${API_BASE_URL}/admin/handover/${encodeURIComponent(id)}/reject`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "You don’t have permission to reject this handover. (403)"
        : `Failed to reject handover: ${res.status}${
            body ? ` ${body}` : ""
          }`,
    );
  }

  return (await res.json()) as AdminHandoverDetail;
}

export type HandoverUpsertPayload = {
  groupId: string;
  handoverDate: string;
  contentJson: unknown;
  changeSummary?: string;
};

export type HandoverUpdatePayload = {
  contentJson?: unknown;
  status?: HandoverLogStatus;
  changeSummary?: string;
};

export async function upsertHandoverDraft(
  payload: HandoverUpsertPayload,
): Promise<{ id: string; status: HandoverLogStatus }> {
  if (isUsingMockApi()) {
    return {
      id: "mock-handover-id",
      status: "DRAFT",
    };
  }
  const res = await fetch(`${API_BASE_URL}/handover`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to save handover: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { id: string; status: HandoverLogStatus };
  return json;
}

export async function updateHandover(
  id: string,
  payload: HandoverUpdatePayload,
): Promise<{ id: string; status: HandoverLogStatus }> {
  if (isUsingMockApi()) {
    return { id, status: payload.status ?? "DRAFT" };
  }
  const res = await fetch(`${API_BASE_URL}/handover/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update handover: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { id: string; status: HandoverLogStatus };
  return json;
}

// --- Classes / Groups management ---

export type ClassRow = {
  id: string;
  name: string;
  tenantId: string;
  minAge: number | null;
  maxAge: number | null;
  description: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
  sessionsCount: number;
};

export type CreateClassPayload = {
  name: string;
  minAge?: number | null;
  maxAge?: number | null;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
};

export type UpdateClassPayload = {
  name?: string;
  minAge?: number | null;
  maxAge?: number | null;
  description?: string | null;
  color?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
};

export async function fetchClasses(): Promise<ClassRow[]> {
  if (isUsingMockApi()) {
    return [
      {
        id: "g1",
        name: "Year 3",
        tenantId: "t1",
        minAge: 7,
        maxAge: 8,
        description: null,
        color: null,
        isActive: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionsCount: 3,
      },
    ];
  }

  const res = await fetch(`${API_BASE_URL}/groups`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch classes: ${res.status} ${body}`);
  }

  return (await res.json()) as ClassRow[];
}

export async function fetchClassById(id: string): Promise<ClassRow | null> {
  if (isUsingMockApi()) {
    return {
      id,
      name: "Year 3",
      tenantId: "t1",
      minAge: 7,
      maxAge: 8,
      description: null,
      color: null,
      isActive: true,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionsCount: 3,
    };
  }

  const res = await fetch(`${API_BASE_URL}/groups/${id}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch class: ${res.status} ${body}`);
  }

  return (await res.json()) as ClassRow;
}

export async function createClass(
  tenantId: string,
  payload: CreateClassPayload,
): Promise<ClassRow> {
  if (isUsingMockApi()) {
    return {
      id: "g-new",
      name: payload.name,
      tenantId: "t1",
      minAge: payload.minAge ?? null,
      maxAge: payload.maxAge ?? null,
      description: payload.description ?? null,
      color: payload.color ?? null,
      isActive: payload.isActive ?? true,
      sortOrder: payload.sortOrder ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionsCount: 0,
    };
  }

  const res = await fetch(`${API_BASE_URL}/groups`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({ ...payload, tenantId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to create class: ${res.status} ${body}`);
  }

  return (await res.json()) as ClassRow;
}

export async function updateClass(
  id: string,
  payload: UpdateClassPayload,
): Promise<ClassRow> {
  if (isUsingMockApi()) {
    return {
      id,
      name: payload.name ?? "Updated",
      tenantId: "t1",
      minAge: payload.minAge ?? null,
      maxAge: payload.maxAge ?? null,
      description: payload.description ?? null,
      color: payload.color ?? null,
      isActive: payload.isActive ?? true,
      sortOrder: payload.sortOrder ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionsCount: 0,
    };
  }

  const res = await fetch(`${API_BASE_URL}/groups/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update class: ${res.status} ${body}`);
  }

  return (await res.json()) as ClassRow;
}

export async function fetchStaffById(
  userId: string,
): Promise<AdminStaffDetail | null> {
  const useMock = isUsingMockApi();
  if (useMock) {
    // TODO: remove mock fallback once admin env always sets NEXT_PUBLIC_API_BASE_URL.
    return {
      id: userId,
      fullName: "Alex Morgan",
      email: "alex.morgan@example.edu",
      roles: ["Staff access"],
      primaryRoleLabel: "Staff access",
      status: "active",
      groups: [],
      sessionsCount: null,
    };
  }

  const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch user: ${res.status} ${body}`);
  }

  const json = (await res.json()) as ApiUser;
  return mapUserToStaffDetail(json);
}

// ========================================
// PEOPLE & INVITES
// ========================================

export type PersonRow = {
  id: string;
  name: string; // Safe display name (computed by API)
  displayName?: string | null; // Raw displayName from DB
  email: string;
  orgRole: string;
  siteAccessSummary: {
    allSites: boolean;
    siteCount: number;
  };
};

export type DeletedPersonRow = {
  id: string;
  userId: string;
  name: string;
  displayName?: string | null;
  email?: string | null;
  priorOrgRole?: string | null;
  priorSiteCount: number;
  deletedAt: string;
  deletedByUserId: string;
};

export type InviteRow = {
  id: string;
  email: string;
  orgRole?: string | null;
  siteAccessMode?: "ALL_SITES" | "SELECT_SITES" | null;
  siteCount?: number;
  siteRole?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  lastSentAt?: string | null;
  status: "pending" | "used" | "expired" | "revoked";
};

export type CreateInvitePayload = {
  email: string;
  name?: string;
  orgRole?: "ORG_ADMIN" | "ORG_MEMBER";
  siteAccess?: {
    mode: "ALL_SITES" | "SELECT_SITES";
    siteIds?: string[];
    role: "SITE_ADMIN" | "STAFF" | "VIEWER";
  };
};

export type AcceptInviteResponse = {
  activeSiteId: string | null;
  orgId: string;
  sites: Array<{ id: string; name: string; orgName?: string | null }>;
};

/**
 * Fetch people (users) with access to an org
 */
export async function fetchPeopleForOrg(orgId: string): Promise<PersonRow[]> {
  const res = await fetch(`${API_BASE_URL}/orgs/${orgId}/people`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[api-client] fetchPeopleForOrg error:", res.status, body);
    throw new Error(`Failed to fetch people: ${res.status} ${body}`);
  }

  return (await res.json()) as PersonRow[];
}

/**
 * Fetch people removed from an org
 */
export async function fetchDeletedPeopleForOrg(
  orgId: string,
): Promise<DeletedPersonRow[]> {
  const res = await fetch(`${API_BASE_URL}/orgs/${orgId}/people/deleted`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch deleted people: ${res.status} ${body}`);
  }

  return (await res.json()) as DeletedPersonRow[];
}

/**
 * Remove a person's access from an org
 */
export async function deletePersonFromOrg(
  orgId: string,
  userId: string,
): Promise<DeletedPersonRow> {
  const res = await fetch(`${API_BASE_URL}/orgs/${orgId}/people/${userId}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete person: ${res.status} ${body}`);
  }

  return (await res.json()) as DeletedPersonRow;
}

/**
 * List invites for an org
 */
export async function fetchInvitesForOrg(
  orgId: string,
  status?: "pending" | "used" | "expired" | "revoked",
): Promise<InviteRow[]> {
  const url = new URL(`${API_BASE_URL}/orgs/${orgId}/invites`);
  if (status) {
    url.searchParams.set("status", status);
  }

  const res = await fetch(url.toString(), {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch invites: ${res.status} ${body}`);
  }

  return (await res.json()) as InviteRow[];
}

/**
 * Create a new invite
 */
export async function createInvite(
  orgId: string,
  payload: CreateInvitePayload,
): Promise<InviteRow> {
  const res = await fetch(`${API_BASE_URL}/orgs/${orgId}/invites`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to create invite: ${res.status} ${body}`);
  }

  return (await res.json()) as InviteRow;
}

/**
 * Resend an invite
 */
export async function resendInvite(
  orgId: string,
  inviteId: string,
): Promise<InviteRow> {
  const res = await fetch(
    `${API_BASE_URL}/orgs/${orgId}/invites/${inviteId}/resend`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to resend invite: ${res.status} ${body}`);
  }

  return (await res.json()) as InviteRow;
}

/**
 * Revoke an invite
 */
export async function revokeInvite(
  orgId: string,
  inviteId: string,
): Promise<InviteRow> {
  const res = await fetch(
    `${API_BASE_URL}/orgs/${orgId}/invites/${inviteId}/revoke`,
    {
      method: "POST",
      headers: buildAuthHeaders(),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to revoke invite: ${res.status} ${body}`);
  }

  return (await res.json()) as InviteRow;
}

/**
 * Accept an invite
 */
export async function acceptInvite(
  token: string,
): Promise<AcceptInviteResponse> {
  const res = await fetch(`${API_BASE_URL}/invites/accept`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to accept invite: ${res.status} ${body}`);
  }

  return (await res.json()) as AcceptInviteResponse;
}

/**
 * Update current user's profile (name, displayName)
 */
export async function updateUserProfile(data: {
  name?: string;
  displayName?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: "PATCH",
    headers: buildAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update profile: ${res.status} ${body}`);
  }
}

// --- Blog (admin) ---

export type AdminBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  contentJson: Record<string, unknown>;
  contentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  thumbnailImageId: string | null;
  headerImageId: string | null;
  status: string;
  publishedAt: string | null;
  tags: string[];
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminBlogUploadAssetResponse = {
  id: string;
  url: string;
  width?: number;
  height?: number;
};

export async function fetchBlogPostsAdmin(
  cursor?: string,
  limit = 50,
): Promise<{ posts: AdminBlogPost[]; nextCursor?: string }> {
  if (isUsingMockApi()) {
    return { posts: [], nextCursor: undefined };
  }
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts?${params}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch blog posts: ${res.status} ${body}`);
  }
  return res.json();
}

export async function fetchBlogPostAdmin(id: string): Promise<AdminBlogPost | null> {
  if (isUsingMockApi()) return null;
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts/${id}`, {
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch blog post: ${res.status} ${body}`);
  }
  return res.json();
}

export async function createBlogPost(data: {
  title: string;
  slug: string;
  excerpt?: string;
  contentJson?: Record<string, unknown>;
  seoTitle?: string;
  seoDescription?: string;
  thumbnailImageId?: string | null;
  headerImageId?: string | null;
  tags?: string[];
}): Promise<AdminBlogPost> {
  if (isUsingMockApi()) {
    throw new Error("Cannot create blog post: API not configured");
  }
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to create blog post: ${res.status} ${body}`);
  }
  return res.json();
}

export async function updateBlogPost(
  id: string,
  data: Partial<{
    title: string;
    slug: string;
    excerpt: string | null;
    contentJson: Record<string, unknown>;
    seoTitle: string | null;
    seoDescription: string | null;
    thumbnailImageId: string | null;
    headerImageId: string | null;
    tags: string[];
    isFeatured: boolean;
  }>,
): Promise<AdminBlogPost> {
  if (isUsingMockApi()) {
    throw new Error("Cannot update blog post: API not configured");
  }
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts/${id}`, {
    method: "PUT",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to update blog post: ${res.status} ${body}`);
  }
  return res.json();
}

export async function publishBlogPost(
  id: string,
  options?: { scheduledAt?: string },
): Promise<{ contentHtml: string; slug: string }> {
  if (isUsingMockApi()) {
    throw new Error("Cannot publish blog post: API not configured");
  }
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts/${id}/publish`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to publish blog post: ${res.status} ${body}`);
  }
  return res.json();
}

export async function deleteBlogPost(id: string): Promise<{ slug: string }> {
  if (isUsingMockApi()) {
    throw new Error("Cannot delete blog post: API not configured");
  }
  const res = await fetch(`${API_BASE_URL}/admin/blog/posts/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to delete blog post: ${res.status} ${body}`);
  }
  return res.json();
}

export async function uploadBlogAsset(
  fileBase64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  type: "THUMBNAIL" | "HEADER" | "INLINE" = "INLINE",
  width?: number,
  height?: number,
): Promise<AdminBlogUploadAssetResponse> {
  if (isUsingMockApi()) {
    throw new Error("Cannot upload blog asset: API not configured");
  }
  const res = await fetch(`${API_BASE_URL}/admin/blog/assets`, {
    method: "POST",
    headers: buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({
      fileBase64,
      mimeType,
      type,
      width,
      height,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to upload blog asset: ${res.status} ${body}`);
  }
  return res.json();
}
