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
const secondChildId = randomUUID();
const otherOrgId = randomUUID();
const otherSiteId = randomUUID();
const otherChildId = randomUUID();
const adminId = randomUUID();
const studentId = randomUUID();
const secondStudentId = randomUUID();
const strangerId = randomUUID();
const studentEmail = `student-${studentId}@example.test`;
const secondEmail = `student-${secondStudentId}@example.test`;

describe("student web identity invitation lifecycle", () => {
  let app: INestApplication | undefined;
  let adminAuthorization = "";
  let studentAuthorization = "";
  let secondAuthorization = "";
  let strangerAuthorization = "";
  const sendStudentInviteEmail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.createMany({
      data: [
        {
          id: orgId,
          name: "Student school",
          slug: `student-${orgId}`,
          planCode: "trial",
        },
        {
          id: otherOrgId,
          name: "Other school",
          slug: `student-${otherOrgId}`,
          planCode: "trial",
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
        {
          id: siteId,
          orgId,
          name: "Student School",
          slug: `student-site-${siteId}`,
        },
        {
          id: otherSiteId,
          orgId: otherOrgId,
          name: "Other School",
          slug: `student-site-${otherSiteId}`,
        },
      ],
    });
    adminAuthorization = (
      await seedE2eAuthUser({
        subject: `student-admin-${adminId}`,
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
    studentAuthorization = (
      await seedE2eAuthUser({
        subject: `student-recipient-${studentId}`,
        userId: studentId,
        email: studentEmail,
      })
    ).authorization;
    secondAuthorization = (
      await seedE2eAuthUser({
        subject: `student-recipient-${secondStudentId}`,
        userId: secondStudentId,
        email: secondEmail,
      })
    ).authorization;
    strangerAuthorization = (
      await seedE2eAuthUser({
        subject: `student-stranger-${strangerId}`,
        userId: strangerId,
      })
    ).authorization;
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.child.createMany({
        data: [
          {
            id: childId,
            tenantId: siteId,
            firstName: "First",
            lastName: "Student",
          },
          {
            id: secondChildId,
            tenantId: siteId,
            firstName: "Second",
            lastName: "Student",
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
          lastName: "Student",
        },
      }),
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue({ sendStudentInviteEmail })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("requires explicit policy and approval, then grants only the verified student", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const disabled = await request(server)
      .post(`/student-invites/children/${childId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: studentEmail, confirmedSchoolApproval: true });
    expect(disabled.status).toBe(409);
    const invalidApproval = await request(server)
      .post(`/student-invites/children/${childId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: studentEmail, confirmedSchoolApproval: false });
    expect(invalidApproval.status).toBe(400);
    const wrongSite = await request(server)
      .post(`/student-invites/children/${otherChildId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: studentEmail, confirmedSchoolApproval: true });
    expect(wrongSite.status).toBe(404);

    const enabled = await request(server)
      .put("/student-invites/policy")
      .set("Authorization", adminAuthorization)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toEqual({ enabled: true });
    const staffAccount = await request(server)
      .post(`/student-invites/children/${secondChildId}`)
      .set("Authorization", adminAuthorization)
      .send({
        email: `${adminId}@example.test`,
        confirmedSchoolApproval: true,
      });
    expect(staffAccount.status).toBe(409);
    const created = await request(server)
      .post(`/student-invites/children/${childId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: studentEmail, confirmedSchoolApproval: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email: studentEmail,
      acceptedAt: null,
    });
    expect(sendStudentInviteEmail).toHaveBeenCalledTimes(1);
    const inviteId = created.body.id as string;
    expect(
      await prisma.studentIdentityLink.count({
        where: { tenantId: siteId, childId },
      }),
    ).toBe(0);

    const wrongAccount = await request(server)
      .post(`/student-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", strangerAuthorization);
    expect(wrongAccount.status).toBe(404);
    const accepted = await request(server)
      .post(`/student-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", studentAuthorization);
    expect(accepted.status).toBe(201);
    expect(accepted.body.acceptedAt).toBeTruthy();
    const acceptedAgain = await request(server)
      .post(`/student-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", studentAuthorization);
    expect(acceptedAgain.status).toBe(201);
    expect(
      await prisma.studentIdentityLink.count({
        where: { tenantId: siteId, childId },
      }),
    ).toBe(1);

    const sites = await request(server)
      .get("/auth/active-site")
      .set("Authorization", studentAuthorization);
    expect(sites.status).toBe(200);
    expect(sites.body.sites).toContainEqual(
      expect.objectContaining({ id: siteId, role: null }),
    );
    const contexts = await request(server)
      .get("/ace/family/contexts")
      .set("Authorization", studentAuthorization);
    expect(contexts.status).toBe(200);
    expect(contexts.body.items).toContainEqual(
      expect.objectContaining({ kind: "student", siteId, childId }),
    );
    expect(contexts.body.items).not.toContainEqual(
      expect.objectContaining({ childId: secondChildId }),
    );

    const duplicateChild = await request(server)
      .post(`/student-invites/children/${childId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: secondEmail, confirmedSchoolApproval: true });
    expect(duplicateChild.status).toBe(409);
    const duplicateIdentity = await request(server)
      .post(`/student-invites/children/${secondChildId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: studentEmail, confirmedSchoolApproval: true });
    expect(duplicateIdentity.status).toBe(409);

    const policyOff = await request(server)
      .put("/student-invites/policy")
      .set("Authorization", adminAuthorization)
      .send({ enabled: false });
    expect(policyOff.status).toBe(200);
    const hidden = await request(server)
      .get("/ace/family/contexts")
      .set("Authorization", studentAuthorization);
    expect(hidden.body.items).not.toContainEqual(
      expect.objectContaining({ kind: "student", siteId }),
    );
    const removedSite = await request(server)
      .get("/auth/active-site")
      .set("Authorization", studentAuthorization);
    expect(removedSite.body.sites).not.toContainEqual(
      expect.objectContaining({ id: siteId }),
    );
    const revoked = await request(server)
      .delete(`/student-invites/children/${childId}/access`)
      .set("Authorization", adminAuthorization)
      .send({ reason: "Student account moved to a new school" });
    expect(revoked.status).toBe(200);
    expect(revoked.body.revokedAt).toBeTruthy();
  });

  it("supports resend and revocation without activating a pending identity", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await request(server)
      .put("/student-invites/policy")
      .set("Authorization", adminAuthorization)
      .send({ enabled: true });
    const created = await request(server)
      .post(`/student-invites/children/${secondChildId}`)
      .set("Authorization", adminAuthorization)
      .send({ email: secondEmail, confirmedSchoolApproval: true });
    expect(created.status).toBe(201);
    const inviteId = created.body.id as string;
    const resent = await request(server)
      .post(`/student-invites/${inviteId}/resend`)
      .set("Authorization", adminAuthorization);
    expect(resent.status).toBe(201);
    await prisma.user.update({
      where: { id: secondStudentId },
      data: { isActive: false },
    });
    const disabledAccount = await request(server)
      .post(`/student-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", secondAuthorization);
    expect(disabledAccount.status).toBe(403);
    await prisma.user.update({
      where: { id: secondStudentId },
      data: { isActive: true },
    });
    const revoked = await request(server)
      .post(`/student-invites/${inviteId}/revoke`)
      .set("Authorization", adminAuthorization);
    expect(revoked.status).toBe(201);
    const denied = await request(server)
      .post(`/student-invites/sites/${siteId}/${inviteId}/accept`)
      .set("Authorization", secondAuthorization);
    expect(denied.status).toBe(409);
    expect(
      await prisma.studentIdentityLink.count({
        where: { tenantId: siteId, childId: secondChildId },
      }),
    ).toBe(0);
  });
});
