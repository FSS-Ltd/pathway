import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { AceNoticeParentInboxService } from "../ace-notice-parent-inbox.service";

jest.mock("@pathway/db", () => ({
  prisma: { tenant: { findUnique: jest.fn() } },
  withTenantRlsContext: jest.fn(),
}));

const siteId = "site-a";
const userId = "parent-a";
const notice = {
  id: "e60bb733-1e40-4dc1-a5a7-7c3603bc4921",
  title: "School update",
  body: "Please read this update.",
  publishedAt: new Date("2026-10-10T10:00:00.000Z"),
  expiresAt: null,
  requiresAcknowledgement: false,
  audienceMembers: [
    {
      receipt: {
        id: "receipt-a",
        deliveredAt: new Date("2026-10-10T10:00:00.000Z"),
        readAt: null,
        acknowledgedAt: null,
      },
    },
  ],
};

function setup() {
  const tx = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: userId }) },
    guardianIdentity: {
      findFirst: jest.fn().mockResolvedValue({ id: "guardian-a" }),
    },
    studentIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    aceNotice: {
      findMany: jest.fn().mockResolvedValue([notice]),
      findFirst: jest.fn().mockResolvedValue(notice),
    },
    aceNoticeReceipt: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({
        readAt: new Date("2026-10-10T11:00:00.000Z"),
      }),
    },
    $queryRaw: jest.fn(),
  };
  jest.mocked(prisma.tenant.findUnique).mockResolvedValue({
    orgId: "org-a",
    org: { parentPortalEnabled: true },
  } as never);
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  return { service: new AceNoticeParentInboxService(), tx };
}

describe("AceNoticeParentInboxService", () => {
  const priorSecret = process.env.INTERNAL_AUTH_SECRET;

  beforeAll(() => {
    process.env.INTERNAL_AUTH_SECRET = "parent-notice-test-secret";
  });
  afterAll(() => {
    if (priorSecret === undefined) delete process.env.INTERNAL_AUTH_SECRET;
    else process.env.INTERNAL_AUTH_SECRET = priorSecret;
  });
  beforeEach(() => jest.clearAllMocks());

  it("lists only delivered guardian snapshots at the requested site", async () => {
    const { service, tx } = setup();
    tx.aceNotice.findMany.mockResolvedValue([
      notice,
      { ...notice, id: "76bb7b15-965c-4648-9cae-3986fdb85957" },
    ]);
    const page = await service.list(siteId, userId, { limit: 1 });
    expect(page.items).toEqual([
      {
        id: notice.id,
        title: notice.title,
        publishedAt: notice.publishedAt,
        expiresAt: null,
        deliveredAt: notice.audienceMembers[0].receipt.deliveredAt,
        readAt: null,
        requiresAcknowledgement: false,
        acknowledgedAt: null,
      },
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(tx.aceNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: siteId,
          audience: { in: ["PARENTS", "PARENTS_AND_STAFF"] },
          legacyImportedAt: null,
          withdrawnAt: null,
          audienceMembers: {
            some: {
              tenantId: siteId,
              recipientUserId: userId,
              recipientKind: "GUARDIAN",
              guardianIdentityId: "guardian-a",
              receipt: { is: { deliveredAt: { not: null } } },
            },
          },
        }),
        take: 2,
      }),
    );
    expect(tx.permissionDefinition.findUnique).toHaveBeenCalledWith({
      where: { key: "ace.parent.notices.read" },
      select: { isActive: true },
    });
    expect(tx.guardianIdentity.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: siteId,
        userId,
        relationships: {
          some: expect.objectContaining({
            legalAccess: "FULL",
            endedAt: null,
            revokedAt: null,
            child: { tenantId: siteId, isGuest: false },
          }),
        },
      }),
      select: { id: true },
    });
    await expect(
      service.list("site-b", userId, {
        limit: 1,
        cursor: page.nextCursor ?? undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(siteId, "parent-b", {
        limit: 1,
        cursor: page.nextCursor ?? undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns detail only within the guardian delivery scope", async () => {
    const { service, tx } = setup();
    await expect(service.get(siteId, userId, notice.id)).resolves.toMatchObject(
      {
        body: notice.body,
        deliveredAt: notice.audienceMembers[0].receipt.deliveredAt,
      },
    );
    expect(tx.aceNotice.findFirst.mock.calls[0][0].where).toMatchObject({
      id: notice.id,
      tenantId: siteId,
      audienceMembers: {
        some: {
          recipientKind: "GUARDIAN",
          guardianIdentityId: "guardian-a",
        },
      },
    });
    tx.aceNotice.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(siteId, userId, notice.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("denies a closed portal, ended link, student identity, and inactive permission", async () => {
    const { service, tx } = setup();
    jest.mocked(prisma.tenant.findUnique).mockResolvedValueOnce({
      orgId: "org-a",
      org: { parentPortalEnabled: false },
    } as never);
    await expect(
      service.list(siteId, userId, { limit: 25 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.guardianIdentity.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.list(siteId, userId, { limit: 25 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.studentIdentity.findUnique.mockResolvedValueOnce({ id: "student-a" });
    await expect(
      service.list(siteId, userId, { limit: 25 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.permissionDefinition.findUnique.mockResolvedValueOnce({
      isActive: false,
    });
    await expect(
      service.list(siteId, userId, { limit: 25 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.aceNotice.findMany).not.toHaveBeenCalled();
  });

  it("marks the scoped receipt once and preserves the original read time", async () => {
    const { service, tx } = setup();
    await expect(service.markRead(siteId, userId, notice.id)).resolves.toEqual({
      readAt: new Date("2026-10-10T11:00:00.000Z"),
    });
    expect(tx.aceNoticeReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "receipt-a", tenantId: siteId, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    tx.aceNotice.findFirst.mockResolvedValueOnce({
      audienceMembers: [
        {
          receipt: {
            ...notice.audienceMembers[0].receipt,
            readAt: new Date("2026-10-10T11:00:00.000Z"),
          },
        },
      ],
    });
    await expect(service.markRead(siteId, userId, notice.id)).resolves.toEqual({
      readAt: new Date("2026-10-10T11:00:00.000Z"),
    });
    expect(tx.aceNoticeReceipt.updateMany).toHaveBeenCalledTimes(1);
    tx.aceNotice.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.markRead(siteId, userId, notice.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("acknowledges only the current guardian recipient when requested", async () => {
    const { service, tx } = setup();
    tx.aceNotice.findFirst.mockResolvedValue({
      ...notice,
      requiresAcknowledgement: true,
    });
    const result = {
      readAt: new Date("2026-10-10T11:00:00.000Z"),
      acknowledgedAt: new Date("2026-10-10T11:00:00.000Z"),
    };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: notice.id }])
      .mockResolvedValueOnce([result]);
    await expect(
      service.acknowledge(siteId, userId, notice.id),
    ).resolves.toEqual(result);
    expect(tx.aceNotice.findFirst.mock.calls[0][0].where).toMatchObject({
      id: notice.id,
      tenantId: siteId,
      audienceMembers: {
        some: { recipientKind: "GUARDIAN", guardianIdentityId: "guardian-a" },
      },
    });

    tx.aceNotice.findFirst.mockResolvedValue(notice);
    await expect(
      service.acknowledge(siteId, userId, notice.id),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(
      service.acknowledge(siteId, userId, notice.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
