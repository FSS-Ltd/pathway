import { HttpStatus, Injectable } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { roleApiError } from "./role-api-error";

const MANAGEMENT_PERMISSION_KEYS = [
  "platform.access.roles.manage",
  "platform.access.assignments.manage",
] as const satisfies readonly PermissionKey[];
const ORGANISATION_SAFETY_LOCK_PREFIX = "ace-role-safety";

export interface RoleMutationCommand {
  tx: Prisma.TransactionClient;
  actorUserId: string;
  orgId: string;
  requestId: string;
  mutate: () => Promise<void>;
}

interface SafetySnapshotRow {
  activeHeadCount: number;
  managementPermissionCount: number;
}

@Injectable()
export class RoleSafetyService {
  async assertHeadAndSelfLockoutSafe(
    command: RoleMutationCommand,
  ): Promise<void> {
    const { tx, actorUserId, orgId, requestId, mutate } = command;

    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(
            ${`${ORGANISATION_SAFETY_LOCK_PREFIX}:${orgId}`},
            0
          )
        )
      `,
    );
    await tx.$executeRaw(
      Prisma.sql`
        SELECT set_config('app.assignment_org_read', 'on', true)
      `,
    );

    await mutate();

    const [safetySnapshot] = await tx.$queryRaw<SafetySnapshotRow[]>(
      Prisma.sql`
        WITH evaluation_time AS MATERIALIZED (
          SELECT statement_timestamp() AS evaluated_at
        )
        SELECT
          (
            SELECT COUNT(DISTINCT assignment."userId")::integer
            FROM "UserRoleAssignment" assignment
            INNER JOIN "OrgRoleDefinition" role_definition
              ON role_definition."id" = assignment."roleDefinitionId"
            CROSS JOIN evaluation_time
            WHERE assignment."orgId" = ${orgId}
              AND assignment."revokedAt" IS NULL
              AND assignment."startsAt" <= evaluation_time.evaluated_at
              AND (
                assignment."expiresAt" IS NULL
                OR assignment."expiresAt" > evaluation_time.evaluated_at
              )
              AND role_definition."orgId" = ${orgId}
              AND role_definition."tenantId" IS NULL
              AND role_definition."scope" = 'organisation'
              AND role_definition."isSystem" = true
              AND role_definition."isActive" = true
              AND role_definition."name" =
                ${SYSTEM_ROLE_TEMPLATES.organisationHead.name}
          ) AS "activeHeadCount",
          (
            SELECT COUNT(DISTINCT role_permission."permissionKey")::integer
          FROM "UserRoleAssignment" assignment
          INNER JOIN "OrgRoleDefinition" role_definition
            ON role_definition."id" = assignment."roleDefinitionId"
          INNER JOIN "OrgRolePermission" role_permission
            ON role_permission."roleDefinitionId" = role_definition."id"
          INNER JOIN "PermissionDefinition" permission_definition
            ON permission_definition."key" = role_permission."permissionKey"
          CROSS JOIN evaluation_time
          WHERE assignment."orgId" = ${orgId}
            AND assignment."userId" = ${actorUserId}
            AND assignment."tenantId" IS NULL
            AND assignment."revokedAt" IS NULL
            AND assignment."startsAt" <= evaluation_time.evaluated_at
            AND (
              assignment."expiresAt" IS NULL
              OR assignment."expiresAt" > evaluation_time.evaluated_at
            )
            AND role_definition."orgId" = ${orgId}
            AND role_definition."tenantId" IS NULL
            AND role_definition."scope" = 'organisation'
            AND role_definition."isActive" = true
            AND permission_definition."isActive" = true
            AND role_permission."permissionKey" IN (
              ${Prisma.join(MANAGEMENT_PERMISSION_KEYS)}
            )
          ) AS "managementPermissionCount"
      `,
    );
    if ((safetySnapshot?.activeHeadCount ?? 0) < 1) {
      throw roleApiError(HttpStatus.CONFLICT, "LAST_HEAD_PROTECTED", requestId);
    }
    if (
      safetySnapshot.managementPermissionCount !==
      MANAGEMENT_PERMISSION_KEYS.length
    ) {
      throw roleApiError(
        HttpStatus.CONFLICT,
        "SELF_LOCKOUT_PROTECTED",
        requestId,
      );
    }
  }
}
