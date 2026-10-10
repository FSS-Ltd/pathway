import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AceNoticeStaffInboxService } from "../ace-notice-staff-inbox.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "staff-a" };
const notice = {
  id: "e60bb733-1e40-4dc1-a5a7-7c3603bc4921",
  title: "Staff update",
  body: "Read this notice.",
  audience: "PARENTS_AND_STAFF" as const,
  publishedAt: new Date("2026-10-10T10:00:00.000Z"),
  expiresAt: null,
  legacyImportedAt: null,
  audienceMembers: [
    {
      receipt: {
        id: "receipt-a",
        deliveredAt: new Date("2026-10-10T10:00:00.000Z"),
        readAt: null,
      },
    },
  ],
};

function createTransaction() {
  return {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        org: { parentPortalEnabled: true },
      }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "membership-a" }),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
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
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  return { service: new AceNoticeStaffInboxService(), tx };
}

describe("AceNoticeStaffInboxService", () => {
  const priorSecret = process.env.INTERNAL_AUTH_SECRET;

  beforeAll(() => {
    process.env.INTERNAL_AUTH_SECRET = "notice-inbox-test-secret";
  });

  afterAll(() => {
    if (priorSecret === undefined) delete process.env.INTERNAL_AUTH_SECRET;
    else process.env.INTERNAL_AUTH_SECRET = priorSecret;
  });

  beforeEach(() => jest.clearAllMocks());

  it("lists only current recipient snapshots with a scoped signed cursor", async () => {
    const tx = createTransaction();
    const older = {
      ...notice,
      id: "76bb7b15-965c-4648-9cae-3986fdb85957",
      publishedAt: new Date("2026-10-10T09:00:00.000Z"),
    };
    tx.aceNotice.findMany.mockResolvedValue([notice, older]);
    const { service } = createService(tx);
    const page = await service.list({ limit: 1 }, actor);
    expect(page.items).toEqual([
      {
        id: notice.id,
        title: notice.title,
        audience: notice.audience,
        historical: false,
        publishedAt: notice.publishedAt,
        expiresAt: null,
        deliveredAt: notice.audienceMembers[0].receipt.deliveredAt,
        readAt: null,
      },
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    const firstWhere = tx.aceNotice.findMany.mock.calls[0][0].where;
    expect(firstWhere).toMatchObject({
      tenantId: actor.tenantId,
      audience: { in: ["STAFF", "PARENTS_AND_STAFF"] },
      withdrawnAt: null,
      AND: expect.arrayContaining([
        {
          OR: [
            { legacyImportedAt: { not: null } },
            {
              audienceMembers: {
                some: {
                  recipientUserId: actor.userId,
                  tenantId: actor.tenantId,
                },
              },
            },
          ],
        },
      ]),
    });
    tx.aceNotice.findMany.mockResolvedValue([older]);
    const next = await service.list(
      { limit: 1, cursor: page.nextCursor ?? undefined },
      actor,
    );
    expect(next.items[0].id).toBe(older.id);
    expect(next.nextCursor).toBeNull();
    expect(tx.aceNotice.findMany.mock.calls[1][0].where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { publishedAt: { lt: notice.publishedAt } },
            { publishedAt: notice.publishedAt, id: { lt: notice.id } },
          ],
        },
      ]),
    );
  });

  it("returns detail and only the caller's receipt after membership checks", async () => {
    const { service, tx } = createService();
    await expect(service.get(notice.id, actor)).resolves.toMatchObject({
      id: notice.id,
      body: notice.body,
      deliveredAt: notice.audienceMembers[0].receipt.deliveredAt,
      readAt: null,
    });
    expect(tx.aceNotice.findFirst.mock.calls[0][0].where).toMatchObject({
      id: notice.id,
      tenantId: actor.tenantId,
      AND: expect.any(Array),
    });
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(service.get(notice.id, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("denies a removed staff member before reading a notice", async () => {
    const tx = createTransaction();
    tx.siteMembership.findFirst.mockResolvedValue(null);
    const { service } = createService(tx);
    await expect(service.get(notice.id, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.aceNotice.findFirst).not.toHaveBeenCalled();
  });

  it("marks only the current recipient's receipt read and preserves retry time", async () => {
    const { service, tx } = createService();
    await expect(service.markRead(notice.id, actor)).resolves.toEqual({
      readAt: new Date("2026-10-10T11:00:00.000Z"),
    });
    expect(tx.aceNoticeReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "receipt-a", tenantId: actor.tenantId, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(tx.aceNotice.findFirst.mock.calls[0][0].where).toMatchObject({
      id: notice.id,
      tenantId: actor.tenantId,
      AND: expect.any(Array),
    });
    tx.aceNotice.findFirst.mockResolvedValue({
      audienceMembers: [
        {
          receipt: {
            ...notice.audienceMembers[0].receipt,
            readAt: new Date("2026-10-10T11:00:00.000Z"),
          },
        },
      ],
    });
    await expect(service.markRead(notice.id, actor)).resolves.toEqual({
      readAt: new Date("2026-10-10T11:00:00.000Z"),
    });
    expect(tx.aceNoticeReceipt.updateMany).toHaveBeenCalledTimes(1);
  });

  it("shows imported staff notices without inventing a delivery or read receipt", async () => {
    const tx = createTransaction();
    tx.aceNotice.findMany.mockResolvedValue([
      {
        ...notice,
        legacyImportedAt: new Date("2026-10-10T12:00:00.000Z"),
        audienceMembers: [],
      },
    ]);
    const { service } = createService(tx);
    const page = await service.list({ limit: 25 }, actor);
    expect(page.items[0]).toMatchObject({
      id: notice.id,
      historical: true,
      deliveredAt: null,
      readAt: null,
    });
  });
});
