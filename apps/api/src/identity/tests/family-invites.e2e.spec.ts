import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { MailerService } from "../../mailer/mailer.service";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const childId = randomUUID();
const otherChildId = randomUUID();
const adminId = randomUUID();
const guardianId = randomUUID();
const strangerId = randomUUID();
const guardianEmail = `guardian-${guardianId}@example.test`;

describe("guardian invitation lifecycle", () => {
  let app: INestApplication | undefined;
  let adminAuthorization = "";
  let guardianAuthorization = "";
  let strangerAuthorization = "";
  const sendFamilyInviteEmail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Guardian invite test",
        slug: `guardian-${orgId}`,
        planCode: "trial",
        parentPortalEnabled: true,
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.create({
      data: {
        id: siteId,
        orgId,
        name: "Guardian School",
        slug: `guardian-site-${siteId}`,
      },
    });
    adminAuthorization = (
      await seedE2eAuthUser({
        subject: `guardian-admin-${adminId}`,
        userId: adminId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: adminId,
      scope: "site",
      permissionKeys: ["students.manage"],
    });
    guardianAuthorization = (
      await seedE2eAuthUser({
        subject: `guardian-recipient-${guardianId}`,
        userId: guardianId,
        email: guardianEmail,
      })
    ).authorization;
    // Clerk's default session token can create this account without an email
    // claim. The invite must retain its addressed email after ownership moves.
    await prisma.user.update({
      where: { id: guardianId },
      data: { email: null },
    });
    strangerAuthorization = (
      await seedE2eAuthUser({
        subject: `guardian-stranger-${strangerId}`,
        userId: strangerId,
      })
    ).authorization;
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.child.createMany({
        data: [
          {
            id: childId,
            tenantId: siteId,
            firstName: "Invited",
            lastName: "Child",
          },
          {
            id: otherChildId,
            tenantId: siteId,
            firstName: "Other",
            lastName: "Child",
          },
        ],
      });
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue({ sendFamilyInviteEmail })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("keeps access pending, rejects another account, then grants only the selected child", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const created = await request(server)
      .post(`/family-invites/guardian/children/${childId}`)
      .set("Authorization", adminAuthorization)
      .send({
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email: guardianEmail,
      acceptedAt: null,
    });
    expect(sendFamilyInviteEmail).toHaveBeenCalledTimes(1);
    const inviteId = created.body.id as string;
    expect(
      await prisma.guardianChildRelationship.count({
        where: { tenantId: siteId, childId },
      }),
    ).toBe(0);
    expect(
      await prisma.siteMembership.count({
        where: { tenantId: siteId, userId: guardianId },
      }),
    ).toBe(0);

    const wrongAccount = await request(server)
      .post(`/family-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", strangerAuthorization);
    expect(wrongAccount.status).toBe(404);

    const accepted = await request(server)
      .post(`/family-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", guardianAuthorization);
    expect(accepted.status).toBe(201);
    expect(accepted.body.acceptedAt).toBeTruthy();
    const acceptedInvite = await request(server)
      .get(`/family-invites/sites/${siteId}/${inviteId}`)
      .set("Authorization", guardianAuthorization);
    expect(acceptedInvite.status).toBe(200);
    expect(acceptedInvite.body.acceptedAt).toBeTruthy();
    const staffInvites = await request(server)
      .get(`/family-invites/guardian/children/${childId}`)
      .set("Authorization", adminAuthorization);
    expect(staffInvites.status).toBe(200);
    expect(staffInvites.body).toContainEqual(
      expect.objectContaining({ id: inviteId, email: guardianEmail }),
    );
    expect(
      await prisma.guardianChildRelationship.count({
        where: {
          tenantId: siteId,
          childId,
          guardianIdentity: { userId: guardianId },
          legalAccess: "FULL",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.siteMembership.count({
        where: { tenantId: siteId, userId: guardianId },
      }),
    ).toBe(0);

    const sites = await request(server)
      .get("/auth/active-site")
      .set("Authorization", guardianAuthorization);
    expect(sites.status).toBe(200);
    expect(sites.body.sites).toContainEqual(
      expect.objectContaining({ id: siteId, role: null }),
    );
    const child = await request(server)
      .get(`/children/${childId}`)
      .set("Authorization", guardianAuthorization);
    expect(child.status).toBe(200);
    const other = await request(server)
      .get(`/children/${otherChildId}`)
      .set("Authorization", guardianAuthorization);
    expect(other.status).toBe(404);
    const list = await request(server)
      .get("/children")
      .set("Authorization", guardianAuthorization);
    expect(list.status).toBe(403);
  });
});
