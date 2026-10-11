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
const otherSiteId = randomUUID();
const childId = randomUUID();
const otherChildId = randomUUID();
const thirdChildId = randomUUID();
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
    await prisma.tenant.createMany({
      data: [
        {
          id: siteId,
          orgId,
          name: "Guardian School",
          slug: `guardian-site-${siteId}`,
        },
        {
          id: otherSiteId,
          orgId,
          name: "Another Guardian School",
          slug: `guardian-site-${otherSiteId}`,
        },
      ],
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
          {
            id: thirdChildId,
            tenantId: siteId,
            firstName: "Third",
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
      await prisma.auditEvent.findFirst({
        where: {
          actorUserId: adminId,
          entityId: inviteId,
          metadata: { path: ["action"], equals: "create" },
        },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: {
        kind: "FAMILY_IDENTITY_INVITE",
        action: "create",
        childId,
        reviewBasis: "SCHOOL_RECORDS",
        legalAccess: "confirmed",
      },
    });
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
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          actorUserId: guardianId,
          entityId: inviteId,
          metadata: { path: ["action"], equals: "accept" },
        },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: { kind: "FAMILY_IDENTITY_INVITE", action: "accept", childId },
    });
    const acceptedInvite = await request(server)
      .get(`/family-invites/sites/${siteId}/${inviteId}`)
      .set("Authorization", guardianAuthorization);
    expect(acceptedInvite.status).toBe(200);
    expect(acceptedInvite.body.acceptedAt).toBeTruthy();
    const hiddenFromAnotherAccount = await request(server)
      .get(`/family-invites/sites/${siteId}/${inviteId}`)
      .set("Authorization", strangerAuthorization);
    expect(hiddenFromAnotherAccount.status).toBe(404);
    const hiddenAtAnotherSite = await request(server)
      .get(`/family-invites/sites/${otherSiteId}/${inviteId}`)
      .set("Authorization", guardianAuthorization);
    expect(hiddenAtAnotherSite.status).toBe(404);
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
    const relationship =
      await prisma.guardianChildRelationship.findFirstOrThrow({
        where: {
          tenantId: siteId,
          childId,
          guardianIdentity: { userId: guardianId },
        },
        select: { id: true },
      });
    expect(
      await prisma.auditEvent.findFirst({
        where: { actorUserId: guardianId, entityId: relationship.id },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: { kind: "GUARDIAN_RELATIONSHIP", childId },
    });
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
    const otherEdit = await request(server)
      .patch(`/children/${otherChildId}`)
      .set("Authorization", guardianAuthorization)
      .send({ firstName: "Changed" });
    expect(otherEdit.status).toBe(404);
    expect(
      await prisma.child.findUnique({ where: { id: otherChildId } }),
    ).toMatchObject({ firstName: "Other" });
    const list = await request(server)
      .get("/children")
      .set("Authorization", guardianAuthorization);
    expect(list.status).toBe(403);

    const sharedInvite = await request(server)
      .post(`/family-invites/guardian/children/${otherChildId}`)
      .set("Authorization", adminAuthorization)
      .send({
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      });
    expect(sharedInvite.status).toBe(201);
    const sharedAcceptance = await request(server)
      .post(
        `/family-invites/sites/${siteId}/${sharedInvite.body.id as string}/accept`,
      )
      .set("Authorization", guardianAuthorization);
    expect(sharedAcceptance.status).toBe(201);
    expect(
      await prisma.guardianChildRelationship.count({
        where: {
          tenantId: siteId,
          childId: { in: [childId, otherChildId] },
          guardianIdentity: { userId: guardianId },
          revokedAt: null,
        },
      }),
    ).toBe(2);
  });

  it("blocks expired and revoked invitations and audits fresh legal review on resend", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const unconfirmed = await request(server)
      .post(`/family-invites/guardian/children/${thirdChildId}`)
      .set("Authorization", adminAuthorization)
      .send({
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: false,
      });
    expect(unconfirmed.status).toBe(400);

    const created = await request(server)
      .post(`/family-invites/guardian/children/${thirdChildId}`)
      .set("Authorization", adminAuthorization)
      .send({
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      });
    expect(created.status).toBe(201);
    const inviteId = created.body.id as string;
    await prisma.familyIdentityInvite.update({
      where: { id: inviteId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredAcceptance = await request(server)
      .post(`/family-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", guardianAuthorization);
    expect(expiredAcceptance.status).toBe(409);
    expect(
      await prisma.guardianChildRelationship.count({
        where: { tenantId: siteId, childId: thirdChildId },
      }),
    ).toBe(0);

    const missingReview = await request(server)
      .post(`/family-invites/guardian/${inviteId}/resend`)
      .set("Authorization", adminAuthorization);
    expect(missingReview.status).toBe(400);
    const falseReview = await request(server)
      .post(`/family-invites/guardian/${inviteId}/resend`)
      .set("Authorization", adminAuthorization)
      .send({ reviewBasis: "LEGAL_DOCUMENT", confirmedLegalAccess: false });
    expect(falseReview.status).toBe(400);
    const resent = await request(server)
      .post(`/family-invites/guardian/${inviteId}/resend`)
      .set("Authorization", adminAuthorization)
      .send({ reviewBasis: "LEGAL_DOCUMENT", confirmedLegalAccess: true });
    expect(resent.status).toBe(201);
    expect(new Date(resent.body.expiresAt as string).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          actorUserId: adminId,
          entityId: inviteId,
          metadata: { path: ["action"], equals: "resend" },
        },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: {
        kind: "FAMILY_IDENTITY_INVITE",
        action: "resend",
        childId: thirdChildId,
        reviewBasis: "LEGAL_DOCUMENT",
        legalAccess: "reconfirmed",
      },
    });
    const revoked = await request(server)
      .post(`/family-invites/guardian/${inviteId}/revoke`)
      .set("Authorization", adminAuthorization);
    expect(revoked.status).toBe(201);
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          actorUserId: adminId,
          entityId: inviteId,
          metadata: { path: ["action"], equals: "revoke" },
        },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: { kind: "FAMILY_IDENTITY_INVITE", action: "revoke" },
    });
    const revokedAcceptance = await request(server)
      .post(`/family-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", guardianAuthorization);
    expect(revokedAcceptance.status).toBe(409);
    expect(
      await prisma.guardianChildRelationship.count({
        where: { tenantId: siteId, childId: thirdChildId },
      }),
    ).toBe(0);
  });
});
