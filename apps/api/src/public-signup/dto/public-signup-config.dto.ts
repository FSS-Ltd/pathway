/**
 * Safe config returned by GET /public/signup/config.
 * No internal IDs; only display names and form config.
 */
export class PublicSignupConfigDto {
  orgName!: string;
  siteName!: string;
  siteTimezone?: string | null;
  /** e.g. ["photo", "emergency_contact", "data_processing"] */
  requiredConsents!: string[];
  formVersion!: string;
  parentPortalEnabled!: boolean;
}
