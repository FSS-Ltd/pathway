import { z } from "zod";

const utmSchema = z
  .object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
  })
  .optional();

export const createDemoLeadDto = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  organisation: z.string().optional(),
  role: z.string().optional(),
  sector: z.string().optional(),
  message: z.string().optional(),
  utm: utmSchema,
});

export type CreateDemoLeadDto = z.infer<typeof createDemoLeadDto>;

export const createToolkitLeadDto = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  orgName: z.string().optional(),
  organisation: z.string().optional(), // alias for orgName (legacy)
  role: z.string().optional(),
  sector: z.string().optional(),
  consentMarketing: z.literal(true, {
    errorMap: () => ({ message: "Consent to be contacted is required" }),
  }),
  utm: utmSchema,
});

export type CreateToolkitLeadDto = z.infer<typeof createToolkitLeadDto>;

const teamTrackerOrganisationTypes = [
  "school",
  "youth_group_or_church",
  "club",
  "charity",
  "other",
] as const;

const teamTrackerRoles = [
  "leader",
  "administrator",
  "safeguarding_lead",
  "volunteer_coordinator",
  "other",
] as const;

const teamTrackerTeamSizes = ["1-10", "11-25", "26-50", "51+"] as const;
const teamTrackerCurrentTools = [
  "spreadsheet",
  "whatsapp",
  "paper",
  "multiple_tools",
  "system",
] as const;

export const createTeamTrackerLeadDto = z.object({
  name: z.string().trim().min(1, "First name is required").max(100),
  email: z.string().email("Invalid email address"),
  organisationType: z.enum(teamTrackerOrganisationTypes),
  role: z.enum(teamTrackerRoles),
  teamSize: z.enum(teamTrackerTeamSizes).optional(),
  currentTools: z.enum(teamTrackerCurrentTools).optional(),
  consentMarketing: z.boolean().default(false),
  utm: utmSchema,
});

export type CreateTeamTrackerLeadDto = z.infer<typeof createTeamTrackerLeadDto>;

export const unsubscribeTeamTrackerDto = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid unsubscribe token"),
});

export type UnsubscribeTeamTrackerDto = z.infer<typeof unsubscribeTeamTrackerDto>;

export const createTrialLeadDto = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  organisation: z.string().optional(),
  sector: z.string().optional(),
  utm: utmSchema,
});

export type CreateTrialLeadDto = z.infer<typeof createTrialLeadDto>;

const homeschoolRegions = [
  "england",
  "wales",
  "scotland",
  "northern-ireland",
  "outside-uk",
] as const;

const homeschoolStages = [
  "exploring",
  "preparing",
  "home-educating",
  "returning",
] as const;

export const createHomeschoolLeadDto = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  email: z.string().email("Invalid email address"),
  region: z.enum(homeschoolRegions),
  stage: z.enum(homeschoolStages),
  consentMarketing: z.literal(true, {
    errorMap: () => ({ message: "Consent to be contacted is required" }),
  }),
  utm: utmSchema,
});

export type CreateHomeschoolLeadDto = z.infer<typeof createHomeschoolLeadDto>;

const riskAreaSchema = z.object({
  area: z.string(),
  severity: z.string(),
  notes: z.string().optional(),
});

export const createReadinessLeadDto = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  organisation: z.string().optional(),
  sector: z.string().optional(),
  answers: z.record(z.union([z.string(), z.number(), z.array(z.string())])).optional(),
  score: z.number().optional(),
  band: z.string().optional(),
  riskAreas: z.array(riskAreaSchema).optional(),
  utm: utmSchema,
});

export type CreateReadinessLeadDto = z.infer<typeof createReadinessLeadDto>;
