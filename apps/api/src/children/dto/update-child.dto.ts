import { z } from "zod";

export const updateChildSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  preferredName: z.string().trim().max(100).nullable().optional(),
  allergies: z.string().trim().min(1).optional(),
  photoKey: z.string().min(1).optional().nullable(),
  // Organisation photo/video consent, independent of the internal profile picture.
  photoConsent: z.boolean().optional(),
  disabilities: z.array(z.string().min(1)).optional(),

  groupId: z.string().uuid().nullable().optional(), // nullable allows explicit disconnect
  guardianIds: z.array(z.string().uuid()).optional(),
});

export type UpdateChildDto = z.infer<typeof updateChildSchema>;
