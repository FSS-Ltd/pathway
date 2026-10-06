import "dotenv/config";
import { readFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@pathway/db";
import { AccessControlModule } from "../src/access-control/access-control.module";
import { assessCustomAssignmentParity } from "../src/access-control/custom-assignment-parity";
import { CutoverPreviewError } from "../src/access-control/custom-assignment-parity-error";
import { readCustomAssignmentInventory } from "../src/access-control/custom-assignment-parity-reader";
import {
  planSchema,
  validateMappings,
} from "../src/access-control/custom-assignment-parity-plan";
import { EffectivePermissionsService } from "../src/access-control/effective-permissions.service";

function planPath(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--plan" || !args[1]) {
    throw new Error(
      "Usage: pnpm --filter @pathway/api access:parity --plan <proposed-plan.json>",
    );
  }
  return args[1];
}

function writeRow(row: object): void {
  process.stdout.write(`${JSON.stringify(row)}\n`);
}

async function loadPlan(path: string) {
  return planSchema.parse(JSON.parse(await readFile(path, "utf8")) as unknown);
}

async function main(): Promise<void> {
  const plan = await loadPlan(planPath(process.argv.slice(2)));
  const now = new Date();
  const inventory = await readCustomAssignmentInventory(plan.orgId, now);
  const { replacements, uncovered } = validateMappings(
    plan.mappings,
    inventory,
  );
  const app = await NestFactory.createApplicationContext(AccessControlModule, {
    logger: false,
  });
  let contextCount = 0;
  let changedCount = 0;
  try {
    const permissions = app.get(EffectivePermissionsService);
    writeRow({
      type: "preview",
      version: 1,
      orgId: plan.orgId,
      capturedAt: now.toISOString(),
      note: "Read-only current-state projection. Actor delegation, grant conflicts, and future role/tag changes require separate checks before retirement.",
    });
    for (const [userId, scopes] of [...replacements.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      for (const tenantId of [null, ...inventory.siteIds]) {
        const current = await permissions.listForUserWithSources(
          userId,
          plan.orgId,
          tenantId ?? undefined,
          now,
        );
        const beforeKeys = new Set<string>(
          current.map(({ permissionKey }) => permissionKey),
        );
        const replacementKeys = [
          ...(scopes.get(null) ?? []),
          ...(tenantId ? (scopes.get(tenantId) ?? []) : []),
        ].filter((key) => beforeKeys.has(key));
        const parity = assessCustomAssignmentParity(
          current,
          inventory.customRoleIds,
          replacementKeys,
        );
        if (parity.gained.length > 0 || parity.lost.length > 0)
          changedCount += 1;
        writeRow({ type: "access", userId, tenantId, ...parity });
        contextCount += 1;
      }
    }
    const parityMatched = changedCount === 0 && uncovered.length === 0;
    writeRow({
      type: "complete",
      assignmentCount: inventory.assignments.length,
      contextCount,
      changedCount,
      uncovered,
      parityMatched,
    });
    if (!parityMatched) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof CutoverPreviewError ||
        (error instanceof Error && error.message.startsWith("Usage:"))
        ? error.message
        : "[access-parity] Failed. Check the plan, organisation, database connection and read permissions.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
