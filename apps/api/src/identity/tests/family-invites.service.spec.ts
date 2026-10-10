import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { ClerkManagementService } from "../../auth/clerk-management.service";
import { MailerService } from "../../mailer/mailer.service";
import { FamilyInvitesService } from "../family-invites.service";
import { GuardianInviteAcceptanceService } from "../guardian-invite-acceptance.service";

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
const userId = "guardian-a";
const invitedUserId = "placeholder-a";
const inviteId = "invite-a";
const email = "parent@example.org";

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
        org: { parentPortalEnabled: true },
      }),
    },
    child: {
      findFirst: jest.fn().mockResolvedValue({ id: childId }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: invitedUserId, email, isActive: true }]),
      findUnique: jest.fn().mockResolvedValue({
        isActive: true,
        lastActiveTenantId: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    guardianIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: "guardian-identity-a" }),
    },
    guardianChildRelationship: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "relationship-a" }),
    },
    familyIdentityInvite: {
      findFirst: jest.fn().mockResolvedValue(invite),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(invite),
    },
    userTenantRole: { upsert: jest.fn().mockResolvedValue({}) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, operation) =>
      operation(tx as never),
    );
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({ orgId } as never);
  jest.mocked(recordAuditEventInTransaction).mockResolvedValue(undefined);
  const mailer = {
    sendFamilyInviteEmail: jest.fn().mockResolvedValue(undefined),
  };
  const clerk = { getVerifiedPrimaryEmail: jest.fn().mockResolvedValue(email) };
  const service = new FamilyInvitesService(mailer as unknown as MailerService);
  const acceptance = new GuardianInviteAcceptanceService(
    clerk as unknown as ClerkManagementService,
  );
  return { tx, service, acceptance, mailer, clerk, invite };
}

describe("guardian identity invitations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a pending child invitation without granting access", async () => {
    const { tx, service, mailer } = setup();
    tx.familyIdentityInvite.findFirst.mockResolvedValue(null);
    tx.familyIdentityInvite.create.mockResolvedValue({
      id: inviteId,
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: null,
      revokedAt: null,
    });

    await expect(
      service.createGuardianInvite(
        tenantId,
        orgId,
        "admin-a",
        childId,
        email,
        "SCHOOL_RECORDS",
      ),
    ).resolves.toEqual(expect.objectContaining({ id: inviteId, email }));
    expect(tx.familyIdentityInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        childId,
        invitedUserId,
        invitedEmail: email,
        target: "GUARDIAN",
      }),
    });
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
    expect(tx.userTenantRole.upsert).not.toHaveBeenCalled();
    expect(mailer.sendFamilyInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: email }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalled();
  });

  it("binds a newly verified account and creates only the selected child relationship on acceptance", async () => {
    const { tx, acceptance } = setup();

    await expect(
      acceptance.acceptGuardianInvite(tenantId, inviteId, userId, email),
    ).resolves.toEqual({ id: inviteId, acceptedAt: expect.any(Date) });
    expect(tx.familyIdentityInvite.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: inviteId, tenantId } },
      data: { invitedUserId: userId },
    });
    expect(tx.guardianChildRelationship.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        guardianIdentityId: "guardian-identity-a",
        childId,
        legalAccess: "FULL",
      },
      select: { id: true },
    });
    expect(tx.child.update).toHaveBeenCalledWith({
      where: { id: childId },
      data: { guardians: { connect: { id: userId } } },
    });
    expect(tx.userTenantRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId, tenantId, role: "PARENT" },
      }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: "accept",
          childId,
          relationshipId: "relationship-a",
        }),
      }),
    );
  });

  it("rejects an unverified or mismatched address before access is created", async () => {
    const { tx, acceptance } = setup();
    await expect(
      acceptance.acceptGuardianInvite(tenantId, inviteId, userId, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      acceptance.acceptGuardianInvite(
        tenantId,
        inviteId,
        userId,
        "other@example.org",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
    expect(tx.userTenantRole.upsert).not.toHaveBeenCalled();
  });

  it("will not transfer an invite already bound to a different identity", async () => {
    const { tx, acceptance, invite } = setup();
    tx.familyIdentityInvite.findFirst.mockResolvedValue({
      ...invite,
      invitedUser: {
        ...invite.invitedUser,
        identities: [{ id: "existing-identity" }],
      },
    });
    await expect(
      acceptance.acceptGuardianInvite(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive guardian account before granting access", async () => {
    const { tx, acceptance } = setup();
    tx.user.findUnique.mockResolvedValue({
      isActive: false,
      lastActiveTenantId: null,
    });
    await expect(
      acceptance.acceptGuardianInvite(tenantId, inviteId, userId, email),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
    expect(tx.userTenantRole.upsert).not.toHaveBeenCalled();
  });

  it("keeps the addressed email after acceptance by an account without a stored email", async () => {
    const { tx, service, acceptance, invite } = setup();
    const acceptedAt = new Date();
    tx.familyIdentityInvite.findFirst.mockResolvedValue({
      ...invite,
      invitedUserId: userId,
      acceptedAt,
      invitedUser: {
        email: null,
        isActive: true,
        identities: [{ id: "clerk-identity" }],
      },
    });
    tx.familyIdentityInvite.findMany.mockResolvedValue([
      {
        id: inviteId,
        expiresAt: invite.expiresAt,
        acceptedAt,
        revokedAt: null,
        invitedEmail: email,
        invitedUser: { email: null },
      },
    ]);

    await expect(
      acceptance.getForInvitee(tenantId, inviteId, userId, email),
    ).resolves.toMatchObject({ acceptedAt });
    await expect(
      acceptance.acceptGuardianInvite(tenantId, inviteId, userId, email),
    ).resolves.toEqual({ id: inviteId, acceptedAt });
    await expect(
      service.listGuardianInvites(tenantId, orgId, childId),
    ).resolves.toEqual([expect.objectContaining({ email })]);
  });

  it("reads a Clerk verified primary address for an access grant", async () => {
    const { acceptance, clerk } = setup();
    await expect(
      acceptance.verifiedEmail({ provider: "clerk", sub: "clerk-a" }),
    ).resolves.toBe(email);
    expect(clerk.getVerifiedPrimaryEmail).toHaveBeenCalledWith("clerk-a");
    await expect(
      acceptance.verifiedEmail({
        provider: "auth0",
        sub: "auth0-a",
        email,
        emailVerified: false,
      }),
    ).resolves.toBeNull();
  });
});
