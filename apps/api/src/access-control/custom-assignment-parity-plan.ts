import { z } from "zod";
import { assessCustomAssignmentCoverage } from "./custom-assignment-inventory";
import { CutoverPreviewError } from "./custom-assignment-parity-error";
import type { readCustomAssignmentInventory } from "./custom-assignment-parity-reader";

export const planSchema = z
  .object({
    orgId: z.string().uuid(),
    mappings: z.array(
      z
        .object({
          assignmentId: z.string().uuid(),
          fixedRoleIds: z.array(z.string().uuid()),
          tagKeys: z.array(z.string().min(1)),
        })
        .strict(),
    ),
  })
  .strict();
type Mapping = z.infer<typeof planSchema>["mappings"][number];

export function validateMappings(
  mappings: readonly Mapping[],
  inventory: Awaited<ReturnType<typeof readCustomAssignmentInventory>>,
) {
  const assignments = new Map(
    inventory.assignments.map((item) => [item.id, item]),
  );
  if (
    mappings.length !== assignments.size ||
    new Set(mappings.map(({ assignmentId }) => assignmentId)).size !==
      mappings.length
  ) {
    throw new CutoverPreviewError(
      "Plan must name every active custom assignment exactly once",
    );
  }
  const replacements = new Map<string, Map<string | null, Set<string>>>();
  const uncovered = [];
  for (const mapping of mappings) {
    const assignment = assignments.get(mapping.assignmentId);
    if (!assignment)
      throw new CutoverPreviewError(
        `Unknown active custom assignment: ${mapping.assignmentId}`,
      );
    if (!inventory.memberIds.has(assignment.userId)) {
      throw new CutoverPreviewError(
        `Assignee has no organisation membership: ${mapping.assignmentId}`,
      );
    }
    const role = assignment.roleDefinition;
    if (
      role.scope === "site" &&
      (mapping.fixedRoleIds.length > 0 || mapping.tagKeys.length > 0) &&
      !inventory.siteMemberKeys.has(`${assignment.userId}:${role.tenantId}`)
    ) {
      throw new CutoverPreviewError(
        `Site recipient lacks site membership: ${mapping.assignmentId}`,
      );
    }
    const coverage = assessCustomAssignmentCoverage(
      {
        id: role.id,
        name: role.name,
        scope: role.scope,
        tenantId: role.tenantId,
        isActive: role.isActive,
        permissionKeys: role.permissions.map(
          ({ permissionKey }) => permissionKey,
        ),
      },
      inventory.fixedRoles,
    );
    const fixed = new Map(
      coverage.fixedRoles.map((candidate) => [candidate.id, candidate]),
    );
    const tags = new Map(
      coverage.accessTags.map((candidate) => [candidate.key, candidate]),
    );
    if (
      new Set(mapping.fixedRoleIds).size !== mapping.fixedRoleIds.length ||
      new Set(mapping.tagKeys).size !== mapping.tagKeys.length
    ) {
      throw new CutoverPreviewError(
        `Duplicate candidate in mapping: ${mapping.assignmentId}`,
      );
    }
    const keys = new Set<string>();
    for (const id of mapping.fixedRoleIds) {
      const candidate = fixed.get(id);
      if (!candidate)
        throw new CutoverPreviewError(
          `Unsafe fixed-role candidate: ${mapping.assignmentId}`,
        );
      candidate.permissionKeys.forEach((key) => keys.add(key));
    }
    for (const key of mapping.tagKeys) {
      const candidate = [...tags.entries()].find(
        ([candidateKey]) => candidateKey === key,
      )?.[1];
      if (!candidate)
        throw new CutoverPreviewError(
          `Unsafe access-tag candidate: ${mapping.assignmentId}`,
        );
      candidate.permissionKeys.forEach((permissionKey) =>
        keys.add(permissionKey),
      );
    }
    const missing = [
      ...new Set(role.permissions.map(({ permissionKey }) => permissionKey)),
    ]
      .filter((key) => !keys.has(key))
      .sort();
    if (missing.length > 0 && role.isActive)
      uncovered.push({ assignmentId: assignment.id, permissionKeys: missing });
    const userScopes =
      replacements.get(assignment.userId) ??
      new Map<string | null, Set<string>>();
    const scopeKeys = userScopes.get(role.tenantId) ?? new Set<string>();
    keys.forEach((key) => scopeKeys.add(key));
    userScopes.set(role.tenantId, scopeKeys);
    replacements.set(assignment.userId, userScopes);
  }
  return { replacements, uncovered };
}
