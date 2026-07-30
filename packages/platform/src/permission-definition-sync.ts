import {
  assertPermissionDefinitionRecordsInSync,
  syncPermissionDefinitionRecords,
  type PermissionDefinitionRecord,
  type PermissionDefinitionSyncResult,
  type PermissionDefinitionTransaction,
  type Prisma,
} from "@pathway/db";
import { CAPABILITY_DEFINITIONS } from "./capability-definitions";

function getPermissionDefinitionRecords(): PermissionDefinitionRecord[] {
  return Object.entries(CAPABILITY_DEFINITIONS).map(([key, definition]) => ({
    key,
    ...definition,
    requiredModule: definition.requiredModule ?? null,
    requiredVertical: definition.requiredVertical ?? null,
  }));
}

function getPermissionDefinitionTransaction(
  tx: Prisma.TransactionClient,
): PermissionDefinitionTransaction {
  return { permissionDefinition: tx.permissionDefinition };
}

export async function syncPermissionDefinitions(
  tx: Prisma.TransactionClient,
): Promise<PermissionDefinitionSyncResult> {
  return syncPermissionDefinitionRecords(
    getPermissionDefinitionTransaction(tx),
    getPermissionDefinitionRecords(),
  );
}

export async function assertPermissionDefinitionsInSync(
  tx: Prisma.TransactionClient,
): Promise<void> {
  return assertPermissionDefinitionRecordsInSync(
    getPermissionDefinitionTransaction(tx),
    getPermissionDefinitionRecords(),
  );
}
