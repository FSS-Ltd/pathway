export type LegalDocumentId = "privacy" | "user-agreement";

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  version: string;
  effectiveDate: string;
  path: string;
  versionPath: string;
};

/** Publication metadata shared with the API and apps in later delivery steps. */
export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    version: "2026-10-15",
    effectiveDate: "15 October 2026",
    path: "/privacy",
    versionPath: "/legal/privacy/2026-10-15",
  },
  "user-agreement": {
    id: "user-agreement",
    title: "User Agreement",
    version: "2026-10-15",
    effectiveDate: "15 October 2026",
    path: "/user-agreement",
    versionPath: "/legal/user-agreement/2026-10-15",
  },
};

export const LEGAL_PRIVACY_EMAIL = "privacy@faithfulsoftware.dev";
