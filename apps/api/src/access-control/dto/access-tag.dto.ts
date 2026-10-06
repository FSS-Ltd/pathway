import { ACCESS_TAG_DEFINITIONS, type AccessTagKey } from "@pathway/platform";
import { z } from "zod";

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const accessTagKey = z
  .string()
  .refine(
    (value): value is AccessTagKey =>
      Object.prototype.hasOwnProperty.call(ACCESS_TAG_DEFINITIONS, value),
    "Unknown access tag",
  );

export const accessTagGrantDto = z
  .object({
    userId: z.string().uuid(),
    tagKey: accessTagKey,
    scope: z.enum(["organisation", "site"]),
    startsAt: isoDate.optional(),
    expiresAt: isoDate.optional(),
  })
  .strict();

export const accessTagGrantListQueryDto = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();

export const accessTagGrantIdParamDto = z
  .object({ grantId: z.string().uuid() })
  .strict();

export type AccessTagGrantInput = z.infer<typeof accessTagGrantDto>;
export type AccessTagGrantListQuery = z.infer<
  typeof accessTagGrantListQueryDto
>;
