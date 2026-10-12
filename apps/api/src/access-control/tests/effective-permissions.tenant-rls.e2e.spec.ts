import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Vertical, prisma } from "@pathway/db";
import { EffectivePermissionsService } from "../effective-permissions.service";
import { AccessControlModule } from "../access-control.module";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const NOW = new Date("2026-07-28T12:00:00.000Z");

/**
 * Regression test for a defect found while planning ACE-F14: PermissionGuard
 * runs before TenantRlsInterceptor (guards execute before interceptors in
 * Nest), so a site-scoped resolve() has no ambient RLS transaction when
 * called from a guard. This suite builds the real AccessControlModule with
 * none of its RLS-relevant providers overridden, and calls resolve()/
 * listForUser() directly - exactly as PermissionGuard does - to prove the
 * service establishes its own tenant RLS context rather than relying on one
 * already being open.
 */
describe("effective permission resolution establishes its own tenant RLS context", () => {
  const fixture = {
    org: randomUUID(),
    site: randomUUID(),
    user: randomUUID(),
    roleDefinition: randomUUID(),
  };
  let service: EffectivePermissionsService | undefined;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.org.create({
      data: {
        id: fixture.org,
        name: "Tenant RLS context org",
        slug: `tenant-rls-context-${fixture.org}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.create({
      data: {
        id: fixture.site,
        name: "Tenant RLS context site",
        slug: `tenant-rls-context-site-${fixture.site}`,
        orgId: fixture.org,
      },
    });
    await prisma.user.create({
      data: { id: fixture.user, email: `${fixture.user}@example.test` },
    });
    await prisma.orgMembership.create({
      data: { orgId: fixture.org, userId: fixture.user },
    });
    await prisma.orgVertical.create({
      data: { orgId: fixture.org, vertical: Vertical.ACE_SCHOOL },
    });
    await prisma.orgRoleDefinition.create({
      data: {
        id: fixture.roleDefinition,
        orgId: fixture.org,
        tenantId: fixture.site,
        name: `Tenant RLS context site role ${fixture.roleDefinition}`,
        scope: "site",
        createdById: fixture.user,
        updatedById: fixture.user,
      },
    });
    await prisma.orgRolePermission.create({
      data: {
        roleDefinitionId: fixture.roleDefinition,
        permissionKey: "ace.pace.read",
        grantedById: fixture.user,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        orgId: fixture.org,
        tenantId: fixture.site,
        userId: fixture.user,
        roleDefinitionId: fixture.roleDefinition,
        assignedById: fixture.user,
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });

    // No provider is overridden: this is the module exactly as it runs in
    // production, including the real EFFECTIVE_PERMISSIONS_CONTEXT.
    moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
    service = moduleRef.get(EffectivePermissionsService);
  });

  afterAll(async () => {
    if (isDatabaseAvailable()) {
      await prisma.userRoleAssignment.deleteMany({
        where: { roleDefinitionId: fixture.roleDefinition },
      });
      await prisma.orgRolePermission.deleteMany({
        where: { roleDefinitionId: fixture.roleDefinition },
      });
      await prisma.orgRoleDefinition.deleteMany({
        where: { id: fixture.roleDefinition },
      });
      await prisma.orgVertical.deleteMany({ where: { orgId: fixture.org } });
      await prisma.orgMembership.deleteMany({
        where: { orgId: fixture.org, userId: fixture.user },
      });
      await prisma.user.deleteMany({ where: { id: fixture.user } });
      await prisma.tenant.deleteMany({ where: { id: fixture.site } });
      await prisma.org.deleteMany({ where: { id: fixture.org } });
    }
    await moduleRef?.close();
  });

  it("resolves a site-scoped permission with no ambient RLS transaction open", async () => {
    if (!service) return;

    await expect(
      service.resolve({
        userId: fixture.user,
        orgId: fixture.org,
        tenantId: fixture.site,
        permission: "ace.pace.read",
        now: NOW,
      }),
    ).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: [fixture.roleDefinition],
    });
  });

  it("lists a site-scoped permission through listForUser with no ambient RLS transaction open", async () => {
    if (!service) return;

    await expect(
      service.listForUser(fixture.user, fixture.org, fixture.site),
    ).resolves.toEqual(["ace.pace.read"]);
  });
});
