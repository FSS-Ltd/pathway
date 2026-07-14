import { z } from "zod";
import { SECTOR_LABELS } from "@pathway/types";

// Business plan code - keep union to allow forward-compatible custom codes
export const planCode = z.union([
  z.enum(["trial", "starter", "pro", "enterprise"]).catch("trial"),
  z.string().min(1),
]);

// Selected once at org creation; drives which features are visible to the org.
export const sectorSchema = z.enum(
  Object.keys(SECTOR_LABELS) as [string, ...string[]],
);

export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+$/,
    "slug must be lowercase letters, numbers, and hyphens only",
  )
  .min(3)
  .max(50);

const uuid = z.string().uuid();

/**
 * Optional billing address (for invoices / compliance); all fields optional here
 * and validated at the billing provider when actually charging.
 */
export const billingAddressDto = z
  .object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().optional(),
    postalCode: z.string().min(2).max(20),
    country: z.string().length(2, "ISO 2-letter country code"),
  })
  .partial()
  .strict();

/**
 * Admin (org owner) initiating registration.
 * Must be either an existing user (by userId), OR supply (email + fullName) for new account invite.
 */
export const adminDto = z
  .object({
    userId: uuid.optional(),
    email: z.string().email().optional(),
    fullName: z.string().min(2).max(120).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.userId || (v.email && v.fullName)),
    "Either userId or (email & fullName) must be provided",
  );

/**
 * First tenant to create under the org (optional).
 * If create=true, name and slug are required.
 */
export const initialTenantDto = z
  .object({
    create: z
      .boolean()
      .default(true)
      .describe("Whether to create the first tenant as part of registration"),
    name: z.string().min(2).max(100).optional(),
    slug: slugSchema.optional(),
  })
  .strict()
  .refine(
    (v) => (v.create ? Boolean(v.name && v.slug) : true),
    "name and slug are required when create=true",
  );

/**
 * Payment/bootstrap hints. The actual tokenization/PM validation is deferred to provider adapter.
 */
export const paymentBootstrapDto = z
  .object({
    provider: z.enum(["stripe"]).default("stripe"),
    paymentMethodId: z.string().min(1).optional(), // e.g., Stripe PM id for immediate attach
    customerId: z.string().min(1).optional(), // link to existing provider customer
    trialDays: z.number().int().positive().max(60).default(14),
  })
  .strict();

/**
 * Main registration payload:
 * - org: required
 * - admin: required (existing user or email+fullName)
 * - initialTenant: optional (defaults to create=true)
 * - payment: optional (provider-specific)
 * - entitlements: optional org-level limits (validated/enforced server-side)
 */
export const registerOrgDto = z
  .object({
    org: z
      .object({
        name: z.string().min(2).max(120),
        slug: slugSchema,
        planCode,
        isSuite: z.boolean().default(true),
        sector: sectorSchema,
        billingEmail: z.string().email().optional(),
        billingAddress: billingAddressDto.optional(),
      })
      .strict(),
    admin: adminDto,
    initialTenant: initialTenantDto.default({ create: true }),
    payment: paymentBootstrapDto.optional(),
    entitlements: z
      .object({
        multiTenantSeats: z.number().int().positive().max(50).optional(),
      })
      .optional(),
  })
  .strict();

export type RegisterOrgDto = z.infer<typeof registerOrgDto>;
export type BillingAddressDto = z.infer<typeof billingAddressDto>;
export type AdminDto = z.infer<typeof adminDto>;
export type InitialTenantDto = z.infer<typeof initialTenantDto>;
export type PaymentBootstrapDto = z.infer<typeof paymentBootstrapDto>;
