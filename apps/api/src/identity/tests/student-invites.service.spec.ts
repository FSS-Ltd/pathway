import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { ClerkManagementService } from "../../auth/clerk-management.service";
import { MailerService } from "../../mailer/mailer.service";
import { StudentInviteAcceptanceService } from "../student-invite-acceptance.service";
import { StudentInvitesService } from "../student-invites.service";

jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("invite-lock") },
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const tenantId = "site-a";
const orgId = "org-a";
const childId = "child-a";
const userId = "student-a";
const invitedUserId = "placeholder-a";
const inviteId = "invite-a";
const email = "student@example.org";

function setup() {
  const invite = {
    id: inviteId,
    tenantId,
    childId,
    invitedUserId,
    invitedEmail: email,
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    tenant: { name: "School" },
    invitedUser: { email, isActive: true, identities: [] },
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        name: "School",
        org: { orgVertical: { vertical: "ACE_SCHOOL" } },
      }),
    },
    studentPortalPolicy: {
      findUnique: jest.fn().mockResolvedValue({ studentPortalEnabled: true }),
    },
    child: { findFirst: jest.fn().mockResolvedValue({ id: childId }) },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: invitedUserId, isActive: true }]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ isActive: true, lastActiveTenantId: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    studentIdentityLink: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "student-link-a" }),
    },
    studentIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "student-identity-a" }),
    },
    guardianIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    siteMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    orgMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    userTenantRole: { findFirst: jest.fn().mockResolvedValue(null) },
    userOrgRole: { findFirst: jest.fn().mockResolvedValue(null) },
    userRoleAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    familyIdentityInvite: {
      findFirst: jest.fn().mockResolvedValue(invite),
      create: jest.fn().mockResolvedValue(invite),
      update: jest.fn().mockResolvedValue(invite),
    },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, operation) =>
      operation(tx as never),
    );
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({ orgId } as never);
  jest.mocked(recordAuditEventInTransaction).mockResolvedValue(undefined);
  const mailer = {
    sendStudentInviteEmail: jest.fn().mockResolvedValue(undefined),
  };
  const clerk = { getVerifiedPrimaryEmail: jest.fn().mockResolvedValue(email) };
  return {
    tx,
    invite,
    mailer,
    service: new StudentInvitesService(mailer as unknown as MailerService),
    acceptance: new StudentInviteAcceptanceService(
      clerk as unknown as ClerkManagementService,
    ),
  };
}

describe("student identity invitations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a pending invite without granting student access", async () => {
    const { tx, service, mailer } = setup();
    tx.familyIdentityInvite.findFirst.mockResolvedValue(null);
    await expect(
      service.create(tenantId, orgId, "admin-a", childId, email),
    ).resolves.toEqual(expect.objectContaining({ id: inviteId, email }));
    expect(tx.familyIdentityInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        childId,
        invitedUserId,
        invitedEmail: email,
        target: "STUDENT",
      }),
    });
    expect(tx.studentIdentityLink.create).not.toHaveBeenCalled();
    expect(mailer.sendStudentInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: email }),
    );
  });

  it("binds the verified account to exactly the invited child on acceptance", async () => {
    const { tx, acceptance } = setup();
    await expect(
      acceptance.accept(tenantId, inviteId, userId, email),
    ).resolves.toEqual({ id: inviteId, acceptedAt: expect.any(Date) });
    expect(tx.familyIdentityInvite.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: inviteId, tenantId } },
      data: { invitedUserId: userId },
    });
    expect(tx.studentIdentityLink.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        studentIdentityId: "student-identity-a",
        childId,
      },
      select: { id: true },
    });
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({
          kind: "STUDENT_IDENTITY_LINK",
          childId,
        }),
      }),
    );
  });

  it("denies an unverified address and a bound invitation owned by another account", async () => {
    const { tx, invite, acceptance } = setup();
    await expect(
      acceptance.accept(tenantId, inviteId, userId, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      acceptance.accept(tenantId, inviteId, userId, "wrong@example.org"),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.familyIdentityInvite.findFirst.mockResolvedValue({
      ...invite,
      invitedUser: { ...invite.invitedUser, identities: [{ id: "bound" }] },
    });
    await expect(
      acceptance.accept(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studentIdentityLink.create).not.toHaveBeenCalled();
  });

  it("denies disabled policy, guardian overlap, and duplicate active links", async () => {
    const { tx, service, acceptance } = setup();
    tx.studentPortalPolicy.findUnique.mockResolvedValue({
      studentPortalEnabled: false,
    });
    await expect(
      service.create(tenantId, orgId, "admin-a", childId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.studentPortalPolicy.findUnique.mockResolvedValue({
      studentPortalEnabled: true,
    });
    tx.guardianIdentity.findUnique.mockResolvedValue({ id: "guardian-a" });
    await expect(
      acceptance.accept(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.guardianIdentity.findUnique.mockResolvedValue(null);
    tx.studentIdentityLink.findFirst.mockResolvedValue({ id: "other-link" });
    await expect(
      acceptance.accept(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studentIdentityLink.create).not.toHaveBeenCalled();
  });

  it("rejects staff and typed-role accounts at invitation and acceptance", async () => {
    const { tx, service, acceptance } = setup();
    tx.siteMembership.findFirst.mockResolvedValue({ id: "staff-site-a" });
    await expect(
      service.create(tenantId, orgId, "admin-a", childId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.siteMembership.findFirst.mockResolvedValue(null);
    tx.userRoleAssignment.findFirst.mockResolvedValue({ id: "staff-role-a" });
    await expect(
      acceptance.accept(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studentIdentityLink.create).not.toHaveBeenCalled();
  });

  it("does not resend an older invitation after another one is pending", async () => {
    const { tx, invite, service, mailer } = setup();
    tx.familyIdentityInvite.findFirst
      .mockResolvedValueOnce(invite)
      .mockResolvedValueOnce({ id: "newer-invite" });

    await expect(
      service.resend(tenantId, orgId, "admin-a", inviteId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.familyIdentityInvite.update).not.toHaveBeenCalled();
    expect(mailer.sendStudentInviteEmail).not.toHaveBeenCalled();
  });
});
