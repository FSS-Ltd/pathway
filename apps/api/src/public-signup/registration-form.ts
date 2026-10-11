/** Consent wording is server-owned and snapshotted with every submission. */
export const REGISTRATION_FORM_VERSION = "2.0";
export const ACE_REGISTRATION_LEVELS = ["ABC", "Primary", "Secondary"] as const;
export const REGISTRATION_CONSENT_WORDING = {
  contact:
    "The organisation may contact my household by phone, SMS or email about my child's care and participation.",
  emergencyMedical:
    "If I cannot be reached, I authorise emergency medical treatment for my child when necessary.",
  localActivities:
    "My child may join supervised local walks, visits and activities.",
  photoVideo:
    "The organisation may use photos or videos of my child for internal displays and communications.",
  accuracy:
    "I confirm the information I have provided is accurate and complete.",
  dataProcessing:
    "My and my child's data may be processed to manage participation and care, in line with the privacy policy.",
  firstAid:
    "I consent to first aid being administered to my child when necessary.",
} as const;

export type RegistrationConsentKey = keyof typeof REGISTRATION_CONSENT_WORDING;
