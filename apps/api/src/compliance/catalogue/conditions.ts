import { z } from "zod";
import { INSTITUTIONAL_VERTICALS } from "@pathway/types";
const text = z.string().trim().min(1);
const stringField = z.enum([
  "countryCode",
  "subdivisionCode",
  "region",
  "localAuthority",
  "belgianEducationCommunity",
  "belgianSchoolRecognitionStatus",
  "belgianFrenchSchoolRoute",
  "belgianChildcareAuthority",
  "sector",
  "vertical",
  "providerCategory",
  "schoolCategory",
  "fundingStatus",
  "provisionPattern",
]);
const allowedValues: Partial<
  Record<z.infer<typeof stringField>, readonly string[]>
> = {
  belgianEducationCommunity: ["FLEMISH", "FRENCH", "GERMAN_SPEAKING"],
  belgianSchoolRecognitionStatus: [
    "COMMUNITY_RECOGNISED",
    "NOT_RECOGNISED",
    "RECOGNISED_ELSEWHERE",
  ],
  belgianFrenchSchoolRoute: [
    "FWB_ORGANISED",
    "FWB_SUBSIDISED",
    "OUTSIDE_FWB_NETWORK",
  ],
  belgianChildcareAuthority: [
    "OPGROEIEN",
    "ONE",
    "IRISCARE",
    "GERMAN_COMMUNITY_MINISTRY",
  ],
  sector: ["SCHOOL", "CHURCH", "CHARITY", "CLUB", "LEARNING_CENTRE"],
  vertical: INSTITUTIONAL_VERTICALS,
  providerCategory: [
    "INDEPENDENT_SCHOOL",
    "STATE_SCHOOL",
    "EARLY_YEARS",
    "CHILDCARE",
    "OUT_OF_SCHOOL",
    "OTHER",
  ],
  schoolCategory: ["MAINTAINED", "ACADEMY", "INDEPENDENT", "NOT_SCHOOL"],
  fundingStatus: ["PUBLIC", "PRIVATE", "MIXED"],
  provisionPattern: ["FULL_TIME", "PART_TIME", "MIXED"],
};
const booleanField = z.enum([
  "englandSchoolMedicalDutiesApply",
  "personalDataController",
  "employsStaff",
  "controlsPremises",
  "foodBusiness",
  "operatesVehicles",
  "eyfsApplies",
  "childcare",
  "belgianPaidUnderThreeCare",
  "charitable",
  "food",
  "transport",
  "trips",
  "boarding",
  "ace",
  "icce",
]);
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: z.infer<typeof stringField>; op: "eq"; value: string }
  | { field: z.infer<typeof booleanField>; op: "eq"; value: boolean }
  | {
      field: "minimumAge" | "maximumAge";
      op: "eq" | "gte" | "lte";
      value: number;
    };
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1) }).strict(),
    z.object({ not: conditionSchema }).strict(),
    z
      .object({ field: stringField, op: z.literal("eq"), value: text })
      .strict()
      .refine(
        (value) =>
          !allowedValues[value.field] ||
          allowedValues[value.field]!.includes(value.value),
        "Invalid field value",
      ),
    z
      .object({ field: booleanField, op: z.literal("eq"), value: z.boolean() })
      .strict(),
    z
      .object({
        field: z.enum(["minimumAge", "maximumAge"]),
        op: z.enum(["eq", "gte", "lte"]),
        value: z.number().int().min(0).max(100),
      })
      .strict(),
  ]),
);
