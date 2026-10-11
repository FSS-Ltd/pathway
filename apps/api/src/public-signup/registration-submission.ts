import { BadRequestException } from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { z } from "zod";
import type {
  ChildSignupDto,
  EmergencyContactDto,
  PickupContactDto,
  RegistrationDecisionsDto,
} from "./dto/public-signup-submit.dto";
import {
  REGISTRATION_CONSENT_WORDING,
  REGISTRATION_FORM_VERSION,
  type RegistrationConsentKey,
} from "./registration-form";

const contactSchema = z.object({
  name: z.string(),
  phone: z.string(),
  relationship: z.string().nullable(),
  secondaryPhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  canPickUp: z.boolean().optional(),
  identificationNote: z.string().nullable().optional(),
});
const decisionSchema = z.object({
  wording: z.string(),
  granted: z.boolean(),
  initials: z.string(),
});
const snapshotSchema = z.object({
  household: z.object({ homeAddress: z.string().nullable() }),
  guardian: contactSchema.extend({ email: z.string() }),
  emergencyContacts: z.array(contactSchema),
  pickupContacts: z.array(contactSchema),
  care: z.object({
    homeLanguage: z.string().nullable(),
    medicalConditions: z.string().nullable(),
    medicationAtCentre: z.string().nullable(),
    dietaryRestrictions: z.string().nullable(),
    learningSupport: z.string().nullable(),
    interestsStrengths: z.string().nullable(),
    settlingComfortNotes: z.string().nullable(),
    allergies: z.string().nullable(),
    additionalNeedsNotes: z.string().nullable(),
    gpName: z.string().nullable(),
    gpPhone: z.string().nullable(),
    schoolName: z.string().nullable(),
    yearGroup: z.string().nullable(),
    specialNeedsType: z.string().nullable(),
    specialNeedsOther: z.string().nullable(),
    pickupPermissions: z.string().nullable(),
    photoConsent: z.boolean(),
  }),
  registrationLevel: z.string().nullable(),
  consents: z.record(decisionSchema),
});
export type RegistrationSnapshot = z.infer<typeof snapshotSchema>;
export type ChildRegistrationRecord = {
  id: string;
  formVersion: string;
  submittedAt: string;
  snapshot: RegistrationSnapshot;
};

type Parent = {
  fullName: string;
  email: string;
  phone?: string;
  relationshipToChild?: string;
};
type ConsentInput = {
  dataProcessingConsent: boolean;
  firstAidConsent?: boolean;
  registration?: RegistrationDecisionsDto;
};
export type RegistrationSubmit = {
  formVersion?: string;
  homeAddress?: string;
  parent: Parent;
  emergencyContacts: EmergencyContactDto[];
  pickupContacts?: PickupContactDto[];
  children: ChildSignupDto[];
  consents: ConsentInput;
};

const clean = (value?: string): string | null => value?.trim() || null;

function consentSnapshot(
  input: ConsentInput,
): RegistrationSnapshot["consents"] {
  const entries = Object.entries(REGISTRATION_CONSENT_WORDING).map(
    ([key, wording]) => {
      const name = key as RegistrationConsentKey;
      const decision = input.registration?.[name];
      const granted =
        name === "dataProcessing"
          ? input.dataProcessingConsent
          : name === "firstAid"
            ? Boolean(input.firstAidConsent)
            : (decision?.granted ?? false);
      return [
        name,
        { wording, granted, initials: decision?.initials.trim() ?? "" },
      ];
    },
  );
  return Object.fromEntries(entries);
}

export function validateRegistrationSubmission(
  input: RegistrationSubmit,
  isAceSchool: boolean,
): void {
  if (input.formVersion !== REGISTRATION_FORM_VERSION) {
    throw new BadRequestException(
      "Registration form has changed. Reload and try again.",
    );
  }
  if (input.children.some((child) => child.registrationLevel && !isAceSchool)) {
    throw new BadRequestException(
      "Registration level is only available to ACE schools",
    );
  }
  if (!clean(input.homeAddress)) {
    throw new BadRequestException("Home address is required");
  }
  if (!clean(input.parent.phone)) {
    throw new BadRequestException("Guardian phone is required");
  }
  const decisions = input.consents.registration;
  const requiredKeys: RegistrationConsentKey[] = [
    "contact",
    "emergencyMedical",
    "localActivities",
    "photoVideo",
    "accuracy",
    "dataProcessing",
    "firstAid",
  ];
  if (
    !decisions ||
    requiredKeys.some((key) => !clean(decisions[key]?.initials))
  ) {
    throw new BadRequestException(
      "Initials are required for every consent decision",
    );
  }
  if (
    decisions.dataProcessing.granted !== input.consents.dataProcessingConsent ||
    decisions.firstAid.granted !== Boolean(input.consents.firstAidConsent)
  ) {
    throw new BadRequestException(
      "Consent decisions do not match the submitted choices",
    );
  }
  if (
    input.children.some((child) => {
      if (!child.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(child.dateOfBirth))
        return true;
      const parsed = new Date(`${child.dateOfBirth}T00:00:00.000Z`);
      return (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== child.dateOfBirth ||
        parsed.getTime() > Date.now()
      );
    })
  ) {
    throw new BadRequestException(
      "Each child needs a valid date of birth that is not in the future",
    );
  }
  if (isAceSchool && input.children.some((child) => !child.registrationLevel)) {
    throw new BadRequestException("ACE registration level is required");
  }
  if (!decisions.accuracy.granted) {
    throw new BadRequestException(
      "Please confirm the registration details are accurate",
    );
  }
}

export async function recordRegistrationSubmissions(
  tenantId: string,
  orgId: string,
  childIds: string[],
  input: RegistrationSubmit,
  isAceSchool: boolean,
  submittedAt: Date,
): Promise<void> {
  await withTenantRlsContext(tenantId, orgId, async (tx) => {
    for (const [index, childId] of childIds.entries()) {
      const child = input.children[index];
      const snapshot: RegistrationSnapshot = {
        household: { homeAddress: clean(input.homeAddress) },
        guardian: {
          name: input.parent.fullName.trim(),
          email: input.parent.email.trim().toLowerCase(),
          phone: input.parent.phone?.trim() ?? "",
          relationship: clean(input.parent.relationshipToChild),
        },
        emergencyContacts: input.emergencyContacts.map((contact) => ({
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          relationship: clean(contact.relationship),
          secondaryPhone: clean(contact.secondaryPhone),
          email: clean(contact.email),
          canPickUp: Boolean(contact.canPickUp),
        })),
        pickupContacts: (input.pickupContacts ?? []).map((contact) => ({
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          relationship: clean(contact.relationship),
          identificationNote: clean(contact.identificationNote),
        })),
        care: {
          homeLanguage: clean(child.homeLanguage),
          medicalConditions: clean(child.medicalConditions),
          medicationAtCentre: clean(child.medicationAtCentre),
          dietaryRestrictions: clean(child.dietaryRestrictions),
          learningSupport: clean(child.learningSupport),
          interestsStrengths: clean(child.interestsStrengths),
          settlingComfortNotes: clean(child.settlingComfortNotes),
          allergies: clean(child.allergies),
          additionalNeedsNotes: clean(child.additionalNeedsNotes),
          gpName: clean(child.gpName),
          gpPhone: clean(child.gpPhone),
          schoolName: clean(child.schoolName),
          yearGroup: clean(child.yearGroup),
          specialNeedsType: clean(child.specialNeedsType),
          specialNeedsOther: clean(child.specialNeedsOther),
          pickupPermissions: clean(child.pickupPermissions),
          photoConsent: child.photoConsent,
        },
        registrationLevel: isAceSchool ? clean(child.registrationLevel) : null,
        consents: consentSnapshot(input.consents),
      };
      await tx.childRegistrationSubmission.createMany({
        data: [
          {
            tenantId,
            childId,
            formVersion: input.formVersion ?? REGISTRATION_FORM_VERSION,
            payload: snapshot as Prisma.InputJsonValue,
            submittedAt,
          },
        ],
      });
    }
  });
}

export async function readRegistrationSubmission(
  tenantId: string,
  orgId: string,
  childId: string,
  userId: string,
): Promise<ChildRegistrationRecord | null> {
  const row = await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return tx.childRegistrationSubmission.findFirst({
      where: { tenantId, childId },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: { id: true, formVersion: true, payload: true, submittedAt: true },
    });
  });
  if (!row) return null;
  return {
    id: row.id,
    formVersion: row.formVersion,
    submittedAt: row.submittedAt.toISOString(),
    snapshot: snapshotSchema.parse(row.payload),
  };
}
