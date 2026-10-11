export type ChildEntry = {
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
  homeLanguage: string;
  medicalConditions: string;
  medicationAtCentre: string;
  dietaryRestrictions: string;
  learningSupport: string;
  interestsStrengths: string;
  settlingComfortNotes: string;
  registrationLevel: string;
};

export const GP_PHONE_REGEX = /^[\d\s+.() -]{10,25}$/;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export type EmergencyEntry = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  secondaryPhone: string;
  email: string;
  canPickUp: boolean;
};

export const defaultChild = (): ChildEntry => ({
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
  homeLanguage: "",
  medicalConditions: "",
  medicationAtCentre: "",
  dietaryRestrictions: "",
  learningSupport: "",
  interestsStrengths: "",
  settlingComfortNotes: "",
  registrationLevel: "",
});

export const defaultEmergency = (): EmergencyEntry => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
  relationship: "",
  secondaryPhone: "",
  email: "",
  canPickUp: false,
});
