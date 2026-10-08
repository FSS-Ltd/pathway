import { ConflictException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../../audit/audit.service";
import { GuardianAccessReviewService } from "../guardian-access-review.service";

jest.mock("@pathway/db", () => ({
  Prisma: { sql: jest.fn().mockReturnValue("review-lock") },
  withTenantRlsContext: jest.fn(),
}));
jest.mock("../../audit/audit.service", () => ({
  recordAuditEventInTransaction: jest.fn(),
}));

const tenantId = "site-a";
const orgId = "org-a";
const parentId = "parent-a";
const childId = "child-a";
const actorId = "reviewer-a";

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        id: tenantId,
        org: { parentPortalEnabled: false },
      }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: parentId,
        firstLoginAt: new Date("2026-10-08T10:00:00Z"),
        identities: [{ id: "identity-a" }],
        children: [
          {
            id: childId,
            firstName: "Sam",
            lastName: "Child",
            isGuest: false,
          },
        ],
      }),
    },
    child: { findFirst: jest.fn().mockResolvedValue({ id: childId }) },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    guardianIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    guardianChildRelationship: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "relationship-a" }),
    },
    userTenantRole: { upsert: jest.fn().mockResolvedValue({ id: "role-a" }) },
  };
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, fn) => fn(tx as never));
  return { tx, service: new GuardianAccessReviewService() };
}

describe("school-reviewed guardian access", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists only the selected site's legacy links and current full access", async () => {
    const { tx, service } = setup();
    tx.guardianIdentity.findUnique.mockResolvedValue({
      relationships: [{ childId }],
    });

    await expect(service.list(tenantId, orgId, parentId)).resolves.toEqual({
      parentId,
      hasVerifiedSignIn: true,
      parentPortalEnabled: false,
      children: [
        {
          id: childId,
          fullName: "Sam Child",
          isGuest: false,
          hasFullAccess: true,
        },
      ],
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      tenantId,
      orgId,
      expect.any(Function),
    );
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: parentId,
          children: { some: { tenantId, tenant: { orgId } } },
        }),
        select: expect.objectContaining({
          children: expect.objectContaining({
            where: { tenantId, tenant: { orgId } },
          }),
        }),
      }),
    );
  });

  it("creates one audited full relationship for a signed-in, linked parent", async () => {
    const { tx, service } = setup();

    await expect(
      service.approve(
        tenantId,
        orgId,
        actorId,
        parentId,
        childId,
        "SCHOOL_RECORDS",
      ),
    ).resolves.toEqual({ id: "relationship-a", childId, created: true });
    expect(tx.child.findFirst).toHaveBeenCalledWith({
      where: {
        id: childId,
        tenantId,
        tenant: { orgId },
        isGuest: false,
        guardians: { some: { id: parentId } },
      },
      select: { id: true },
    });
    expect(tx.guardianChildRelationship.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        guardianIdentityId: "guardian-a",
        childId,
        legalAccess: "FULL",
      },
      select: { id: true },
    });
    expect(tx.userTenantRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_tenantId_role: {
            userId: parentId,
            tenantId,
            role: "PARENT",
          },
        },
      }),
    );
    expect(recordAuditEventInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: actorId,
        tenantId,
        orgId,
        entityId: "relationship-a",
        metadata: expect.objectContaining({
          parentUserId: parentId,
          childId,
          reviewBasis: "SCHOOL_RECORDS",
        }),
      }),
    );
  });

  it("rejects unlinked, guest, student, and never-signed-in identities", async () => {
    const cases = [
      (tx: ReturnType<typeof setup>["tx"]) =>
        tx.child.findFirst.mockResolvedValue(null),
      (tx: ReturnType<typeof setup>["tx"]) =>
        tx.studentIdentity.findUnique.mockResolvedValue({ id: "student-a" }),
      (tx: ReturnType<typeof setup>["tx"]) =>
        tx.user.findFirst.mockResolvedValue(null),
    ];
    for (const deny of cases) {
      const { tx, service } = setup();
      deny(tx);
      await expect(
        service.approve(
          tenantId,
          orgId,
          actorId,
          parentId,
          childId,
          "SCHOOL_RECORDS",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
    }

    const { tx, service } = setup();
    tx.user.findFirst.mockResolvedValue({
      id: parentId,
      firstLoginAt: null,
      identities: [],
    });
    await expect(
      service.approve(
        tenantId,
        orgId,
        actorId,
        parentId,
        childId,
        "SCHOOL_RECORDS",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
  });

  it("does not create a second current full relationship", async () => {
    const { tx, service } = setup();
    tx.guardianChildRelationship.findFirst.mockResolvedValue({
      id: "existing",
    });

    await expect(
      service.approve(
        tenantId,
        orgId,
        actorId,
        parentId,
        childId,
        "LEGAL_DOCUMENT",
      ),
    ).resolves.toEqual({ id: "existing", childId, created: false });
    expect(tx.guardianChildRelationship.create).not.toHaveBeenCalled();
    expect(recordAuditEventInTransaction).not.toHaveBeenCalled();
  });
});
