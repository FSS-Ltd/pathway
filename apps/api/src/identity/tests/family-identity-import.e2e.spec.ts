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
const otherOrgId = randomUUID();
const otherSiteId = randomUUID();
const firstChildId = randomUUID();
const secondChildId = randomUUID();
const otherChildId = randomUUID();
const adminId = randomUUID();
const staffId = randomUUID();
const guardianEmail = `bulk-guardian-${randomUUID()}@example.test`;
const studentEmail = `bulk-student-${randomUUID()}@example.test`;
const failedEmail = `bulk-undelivered-${randomUUID()}@example.test`;

describe("family identity invitation import", () => {
  let app: INestApplication | undefined;
  let adminAuthorization = "";
  let staffAuthorization = "";
  const sendFamilyInviteEmail = jest.fn().mockResolvedValue(undefined);
  const sendStudentInviteEmail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.createMany({
      data: [
        {
          id: orgId,
          name: "Bulk school",
          slug: `bulk-${orgId}`,
          planCode: "trial",
          parentPortalEnabled: true,
        },
        {
          id: otherOrgId,
          name: "Other school",
          slug: `bulk-${otherOrgId}`,
          planCode: "trial",
          parentPortalEnabled: true,
        },
      ],
    });
    await prisma.orgVertical.createMany({
      data: [
        { orgId, vertical: "ACE_SCHOOL" },
        { orgId: otherOrgId, vertical: "ACE_SCHOOL" },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: siteId, orgId, name: "Bulk School", slug: `bulk-site-${siteId}` },
        {
          id: otherSiteId,
          orgId: otherOrgId,
          name: "Other School",
          slug: `bulk-site-${otherSiteId}`,
        },
      ],
    });
    adminAuthorization = (
      await seedE2eAuthUser({
        subject: `bulk-admin-${adminId}`,
        userId: adminId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    staffAuthorization = (
      await seedE2eAuthUser({
        subject: `bulk-staff-${staffId}`,
        userId: staffId,
        tenantId: siteId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    for (const userId of [adminId, staffId]) {
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId,
        scope: "site",
        permissionKeys: ["students.manage"],
      });
    }
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.child.createMany({
        data: [
          {
            id: firstChildId,
            tenantId: siteId,
            firstName: "First",
            lastName: "Child",
          },
          {
            id: secondChildId,
            tenantId: siteId,
            firstName: "Second",
            lastName: "Child",
          },
        ],
      }),
    );
    await withTenantRlsContext(otherSiteId, otherOrgId, (tx) =>
      tx.child.create({
        data: {
          id: otherChildId,
          tenantId: otherSiteId,
          firstName: "Other",
          lastName: "Child",
        },
      }),
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue({ sendFamilyInviteEmail, sendStudentInviteEmail })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("validates per-person approval and organisation-admin authority", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const invalid = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({
        rows: [
          {
            target: "STUDENT",
            childId: firstChildId,
            email: studentEmail,
            confirmedSchoolApproval: false,
          },
        ],
      });
    expect(invalid.status).toBe(400);
    const oversized = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({
        rows: Array.from({ length: 11 }, () => ({
          target: "GUARDIAN",
          childId: firstChildId,
          email: guardianEmail,
          reviewBasis: "SCHOOL_RECORDS",
          confirmedLegalAccess: true,
        })),
      });
    expect(oversized.status).toBe(400);
    const denied = await request(server)
      .post("/family-identity-import")
      .set("Authorization", staffAuthorization)
      .send({
        rows: [
          {
            target: "GUARDIAN",
            childId: firstChildId,
            email: guardianEmail,
            reviewBasis: "SCHOOL_RECORDS",
            confirmedLegalAccess: true,
          },
        ],
      });
    expect(denied.status).toBe(401);
    expect(
      await prisma.familyIdentityInvite.count({ where: { tenantId: siteId } }),
    ).toBe(0);
  });

  it("reuses one account across children, keeps access pending, and skips retries", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const enabled = await request(server)
      .put("/student-invites/policy")
      .set("Authorization", adminAuthorization)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    const rows = [
      {
        target: "GUARDIAN",
        childId: firstChildId,
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      },
      {
        target: "GUARDIAN",
        childId: secondChildId,
        email: guardianEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      },
      {
        target: "STUDENT",
        childId: firstChildId,
        email: studentEmail,
        confirmedSchoolApproval: true,
      },
      {
        target: "STUDENT",
        childId: secondChildId,
        email: studentEmail,
        confirmedSchoolApproval: true,
      },
      {
        target: "STUDENT",
        childId: secondChildId,
        email: guardianEmail,
        confirmedSchoolApproval: true,
      },
      {
        target: "GUARDIAN",
        childId: otherChildId,
        email: failedEmail,
        reviewBasis: "SCHOOL_RECORDS",
        confirmedLegalAccess: true,
      },
    ];
    const first = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({ rows });
    expect(first.status).toBe(201);
    expect(first.body.map((row: { status: string }) => row.status)).toEqual([
      "invited",
      "invited",
      "invited",
      "failed",
      "failed",
      "failed",
    ]);
    expect(sendFamilyInviteEmail).toHaveBeenCalledTimes(2);
    expect(sendStudentInviteEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.user.count({ where: { email: guardianEmail } })).toBe(
      1,
    );
    expect(
      await prisma.familyIdentityInvite.count({ where: { tenantId: siteId } }),
    ).toBe(3);
    expect(
      await prisma.guardianChildRelationship.count({
        where: { tenantId: siteId },
      }),
    ).toBe(0);
    expect(
      await prisma.studentIdentityLink.count({ where: { tenantId: siteId } }),
    ).toBe(0);

    const repeated = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({ rows });
    expect(repeated.status).toBe(201);
    expect(repeated.body.map((row: { status: string }) => row.status)).toEqual([
      "existing",
      "existing",
      "existing",
      "failed",
      "failed",
      "failed",
    ]);
    expect(sendFamilyInviteEmail).toHaveBeenCalledTimes(2);
    expect(sendStudentInviteEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.user.count({ where: { email: guardianEmail } })).toBe(
      1,
    );
    expect(
      await prisma.familyIdentityInvite.count({ where: { tenantId: siteId } }),
    ).toBe(3);
  });

  it("leaves a saved invitation unchanged after an email delivery failure", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    sendFamilyInviteEmail.mockRejectedValueOnce(
      new Error("mail provider unavailable"),
    );
    const rows = [
      {
        target: "GUARDIAN",
        childId: firstChildId,
        email: failedEmail,
        reviewBasis: "LEGAL_DOCUMENT",
        confirmedLegalAccess: true,
      },
    ];
    const first = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({ rows });
    expect(first.body[0].status).toBe("failed");
    const repeated = await request(server)
      .post("/family-identity-import")
      .set("Authorization", adminAuthorization)
      .send({ rows });
    expect(repeated.body[0].status).toBe("existing");
    expect(sendFamilyInviteEmail).toHaveBeenCalledTimes(3);
    expect(
      await prisma.familyIdentityInvite.count({
        where: {
          tenantId: siteId,
          childId: firstChildId,
          invitedEmail: failedEmail,
        },
      }),
    ).toBe(1);
  });
});
