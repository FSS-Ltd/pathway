import type {
  Module,
  PermissionScope,
  PermissionSensitivity,
  Vertical,
} from "@prisma/client";

export type PermissionDefinitionScope = PermissionScope;

export type PermissionDefinitionSensitivity = PermissionSensitivity;

export interface PermissionDefinitionRecord {
  key: string;
  label: string;
  description: string;
  scope: PermissionDefinitionScope;
  sensitivity: PermissionDefinitionSensitivity;
  delegable: boolean;
  requiredModule: Module | null;
  requiredVertical: Vertical | null;
}

export interface StoredPermissionDefinition extends PermissionDefinitionRecord {
  isActive: boolean;
}

interface PermissionDefinitionDelegate {
  findMany(): Promise<StoredPermissionDefinition[]>;
  createMany(args: {
    data: Array<PermissionDefinitionRecord & { isActive: boolean }>;
  }): Promise<{ count: number }>;
  update(args: {
    where: { key: string };
    data: Partial<StoredPermissionDefinition>;
  }): Promise<unknown>;
  updateMany(args: {
    where: { key: { in: string[] }; isActive: boolean };
    data: { isActive: boolean };
  }): Promise<{ count: number }>;
}

export interface PermissionDefinitionTransaction {
  permissionDefinition: PermissionDefinitionDelegate;
}

export interface PermissionDefinitionSyncResult {
  inserted: number;
  updated: number;
  deactivated: number;
}

export class PermissionDefinitionDriftError extends Error {
  constructor(message: string) {
    super(`Permission definition drift detected: ${message}`);
    this.name = "PermissionDefinitionDriftError";
  }
}

const WRITE_BATCH_SIZE = 100;

function getBatches<T>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += WRITE_BATCH_SIZE) {
    batches.push(items.slice(index, index + WRITE_BATCH_SIZE));
  }
  return batches;
}

function hasMatchingMetadata(
  stored: StoredPermissionDefinition,
  definition: PermissionDefinitionRecord,
): boolean {
  return (
    stored.label === definition.label &&
    stored.description === definition.description &&
    stored.scope === definition.scope &&
    stored.sensitivity === definition.sensitivity &&
    stored.delegable === definition.delegable &&
    stored.requiredModule === definition.requiredModule &&
    stored.requiredVertical === definition.requiredVertical
  );
}

export async function syncPermissionDefinitionRecords(
  tx: PermissionDefinitionTransaction,
  definitions: readonly PermissionDefinitionRecord[],
): Promise<PermissionDefinitionSyncResult> {
  const storedDefinitions = new Map(
    (await tx.permissionDefinition.findMany()).map((definition) => [
      definition.key,
      definition,
    ]),
  );
  const registryKeys = new Set(definitions.map(({ key }) => key));
  const missingDefinitions: Array<
    PermissionDefinitionRecord & { isActive: boolean }
  > = [];
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;

  for (const definition of definitions) {
    const stored = storedDefinitions.get(definition.key);
    if (!stored) {
      missingDefinitions.push({ ...definition, isActive: true });
    } else if (!hasMatchingMetadata(stored, definition) || !stored.isActive) {
      await tx.permissionDefinition.update({
        where: { key: definition.key },
        data: { ...definition, isActive: true },
      });
      updated += 1;
    }
  }

  for (const batch of getBatches(missingDefinitions)) {
    const result = await tx.permissionDefinition.createMany({ data: batch });
    inserted += result.count;
  }

  const activeDatabaseOnlyKeys = [...storedDefinitions.values()]
    .filter(({ isActive, key }) => isActive && !registryKeys.has(key))
    .map(({ key }) => key)
    .sort();
  for (const batch of getBatches(activeDatabaseOnlyKeys)) {
    const result = await tx.permissionDefinition.updateMany({
      where: { key: { in: batch }, isActive: true },
      data: { isActive: false },
    });
    deactivated += result.count;
  }

  return { inserted, updated, deactivated };
}

export async function assertPermissionDefinitionRecordsInSync(
  tx: PermissionDefinitionTransaction,
  definitions: readonly PermissionDefinitionRecord[],
): Promise<void> {
  const registryDefinitions = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );
  const registryKeys = new Set(registryDefinitions.keys());
  const storedDefinitions = await tx.permissionDefinition.findMany();
  const storedKeys = new Set(storedDefinitions.map(({ key }) => key));
  const missingKeys = definitions
    .filter(({ key }) => !storedKeys.has(key))
    .map(({ key }) => key)
    .sort();
  const inactiveKeys = storedDefinitions
    .filter(({ isActive, key }) => !isActive && registryKeys.has(key))
    .map(({ key }) => key)
    .sort();
  const metadataMismatchKeys = storedDefinitions
    .filter((stored) => {
      const definition = registryDefinitions.get(stored.key);
      return (
        definition !== undefined && !hasMatchingMetadata(stored, definition)
      );
    })
    .map(({ key }) => key)
    .sort();
  const activeDatabaseOnlyKeys = storedDefinitions
    .filter(({ isActive, key }) => isActive && !registryKeys.has(key))
    .map(({ key }) => key)
    .sort();
  const driftReasons: string[] = [];

  if (missingKeys.length > 0) {
    driftReasons.push(`missing keys: ${missingKeys.join(", ")}`);
  }
  if (inactiveKeys.length > 0) {
    driftReasons.push(`inactive keys: ${inactiveKeys.join(", ")}`);
  }
  if (metadataMismatchKeys.length > 0) {
    driftReasons.push(
      `metadata mismatches: ${metadataMismatchKeys.join(", ")}`,
    );
  }
  if (activeDatabaseOnlyKeys.length > 0) {
    driftReasons.push(
      `active database-only keys: ${activeDatabaseOnlyKeys.join(", ")}`,
    );
  }
  if (driftReasons.length > 0) {
    throw new PermissionDefinitionDriftError(driftReasons.join("; "));
  }
}
