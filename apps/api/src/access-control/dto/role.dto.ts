import { z } from "zod";

const permissionKeys = z.array(z.string().min(1)).min(1);

export const createRoleDto = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  scope: z.enum(["organisation", "site"]),
  permissionKeys,
}).strict();

export const updateRoleDto = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  permissionKeys,
}).strict();

export const cloneRoleDto = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
}).strict();

export const retireRoleDto = z.object({
  expectedVersion: z.number().int().positive(),
}).strict();

export type CreateRoleDto = z.infer<typeof createRoleDto>;
export type UpdateRoleDto = z.infer<typeof updateRoleDto>;
export type CloneRoleDto = z.infer<typeof cloneRoleDto>;
export type RetireRoleDto = z.infer<typeof retireRoleDto>;
