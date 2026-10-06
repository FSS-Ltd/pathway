import "dotenv/config";
import { prisma, withOrgRlsContext } from "@pathway/db";
import {
  assessCustomAssignmentCoverage,
  type InventoryRole,
} from "../src/access-control/custom-assignment-inventory";

const PAGE_SIZE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredOrgId(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--org-id" || !UUID.test(args[1])) {
    throw new Error(
      "Usage: pnpm --filter @pathway/api access:inventory --org-id <UUID>",
    );
  }
  return args[1];
}

function writeRow(row: object): void {
  process.stdout.write(`${JSON.stringify(row)}\n`);
}

async function main(): Promise<void> {
  const orgId = requiredOrgId(process.argv.slice(2));
  const capturedAt = new Date();
  const fixedRoles = await withOrgRlsContext(orgId, async (tx) => {
    const org = await tx.org.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new Error("Organisation not found");
    const roles = await tx.orgRoleDefinition.findMany({
      where: { orgId, isSystem: true, isActive: true },
      select: {
        id: true,
        name: true,
        scope: true,
        tenantId: true,
        isActive: true,
        permissions: { select: { permissionKey: true } },
      },
    });
    return roles.map(
      (role): InventoryRole => ({
        id: role.id,
        name: role.name,
        scope: role.scope,
        tenantId: role.tenantId,
        isActive: role.isActive,
        permissionKeys: role.permissions.map(
          ({ permissionKey }) => permissionKey,
        ),
      }),
    );
  });

  writeRow({
    type: "inventory",
    version: 1,
    orgId,
    capturedAt: capturedAt.toISOString(),
    note: "Read-only raw-key candidates; delegation, entitlement, site membership, and effective-access parity must be checked before any replacement.",
  });

  let cursor: string | undefined;
  let count = 0;
  let uncoveredCount = 0;
  while (true) {
    const assignments = await withOrgRlsContext(orgId, (tx) =>
      tx.userRoleAssignment.findMany({
        where: {
          orgId,
          startsAt: { lte: capturedAt },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: capturedAt } }],
          roleDefinition: { orgId, isSystem: false },
        },
        orderBy: { id: "asc" },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          userId: true,
          startsAt: true,
          expiresAt: true,
          roleDefinition: {
            select: {
              id: true,
              name: true,
              scope: true,
              tenantId: true,
              isActive: true,
              permissions: { select: { permissionKey: true } },
            },
          },
        },
      }),
    );

    for (const assignment of assignments) {
      const role = assignment.roleDefinition;
      const customRole: InventoryRole = {
        id: role.id,
        name: role.name,
        scope: role.scope,
        tenantId: role.tenantId,
        isActive: role.isActive,
        permissionKeys: role.permissions.map(
          ({ permissionKey }) => permissionKey,
        ),
      };
      const coverage = assessCustomAssignmentCoverage(customRole, fixedRoles);
      if (coverage.uncoveredPermissionKeys.length > 0) uncoveredCount += 1;
      writeRow({
        type: "assignment",
        assignmentId: assignment.id,
        userId: assignment.userId,
        startsAt: assignment.startsAt.toISOString(),
        expiresAt: assignment.expiresAt?.toISOString() ?? null,
        customRole,
        coverage,
      });
      count += 1;
    }

    if (assignments.length < PAGE_SIZE) break;
    cursor = assignments[assignments.length - 1].id;
  }
  writeRow({ type: "complete", assignmentCount: count, uncoveredCount });
}

void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && error.message.startsWith("Usage:")
        ? error.message
        : "[access-inventory] Failed. Check the organisation ID, database connection, and read permissions.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
