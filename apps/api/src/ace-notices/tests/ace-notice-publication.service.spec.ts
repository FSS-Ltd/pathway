import { ConflictException } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import { AceNoticePublicationService } from "../ace-notice-publication.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  Prisma: { sql: jest.fn().mockReturnValue("notice-lock") },
}));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "publisher-a" };
const notice = {
  id: "notice-a",
  tenantId: actor.tenantId,
  title: "Site notice",
  body: "Please read the update.",
  audience: "PARENTS_AND_STAFF" as const,
  audienceScope: "SITE",
  audienceTargetId: null,
  publishedAt: null,
  withdrawnAt: null,
  expiresAt: null,
  updatedAt: new Date("2026-10-10T10:00:00.000Z"),
};

function createTransaction() {
  return {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        org: { parentPortalEnabled: true },
      }),
    },
    orgVertical: {
      findFirst: jest.fn().mockResolvedValue({ orgId: actor.orgId }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "member-a" }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          { userId: actor.userId },
          { userId: "guardian-a" },
        ]),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    permissionDefinition: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true }),
    },
    guardianIdentity: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "guardian-id-a", userId: "guardian-a" }]),
    },
    aceNotice: {
      findFirst: jest.fn().mockResolvedValue(notice),
      update: jest
        .fn()
        .mockResolvedValue({ ...notice, publishedAt: new Date() }),
    },
    aceNoticeAudienceMember: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "member-a" }, { id: "member-b" }]),
    },
    aceNoticeReceipt: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([{ id: notice.id }]),
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
  return {
    tx,
    outbox,
    service: new AceNoticePublicationService(
      outbox as unknown as OutboxService,
    ),
  };
}

describe("AceNoticePublicationService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deduplicates a staff guardian and publishes one receipt per recipient", async () => {
    const { service, tx, outbox } = createService();
    const preview = await service.preview(notice.id, actor);
    expect(preview.recipientCount).toBe(2);
    const result = await service.publish(
      notice.id,
      {
        expectedUpdatedAt: notice.updatedAt.toISOString(),
        expectedAudienceVersion: preview.audienceVersion,
      },
      actor,
    );
    expect(result.recipientCount).toBe(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.aceNoticeAudienceMember.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: actor.tenantId,
          noticeId: notice.id,
          recipientUserId: "guardian-a",
          recipientKind: "GUARDIAN",
          guardianIdentityId: "guardian-id-a",
        },
        {
          tenantId: actor.tenantId,
          noticeId: notice.id,
          recipientUserId: actor.userId,
          recipientKind: "STAFF",
          guardianIdentityId: null,
        },
      ],
    });
    expect(tx.aceNoticeReceipt.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ audienceMemberId: "member-a" }),
        expect.objectContaining({ audienceMemberId: "member-b" }),
      ]),
    });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed audience before creating rows", async () => {
    const { service, tx } = createService();
    await expect(
      service.publish(
        notice.id,
        {
          expectedUpdatedAt: notice.updatedAt.toISOString(),
          expectedAudienceVersion: "0".repeat(64),
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.aceNoticeAudienceMember.createMany).not.toHaveBeenCalled();
  });

  it("rejects publication when no eligible recipients remain", async () => {
    const { service, tx } = createService();
    tx.siteMembership.findMany.mockResolvedValue([]);
    tx.guardianIdentity.findMany.mockResolvedValue([]);
    await expect(
      service.publish(
        notice.id,
        {
          expectedUpdatedAt: notice.updatedAt.toISOString(),
          expectedAudienceVersion: "0".repeat(64),
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.aceNoticeAudienceMember.createMany).not.toHaveBeenCalled();
  });

  it("rejects a stale draft revision after locking the notice", async () => {
    const { service, tx } = createService();
    await expect(
      service.publish(
        notice.id,
        {
          expectedUpdatedAt: "2026-10-10T09:00:00.000Z",
          expectedAudienceVersion: "0".repeat(64),
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.aceNoticeAudienceMember.createMany).not.toHaveBeenCalled();
  });

  it("returns the issued notice on retry and withdraws it only once", async () => {
    const tx = createTransaction();
    const publishedAt = new Date("2026-10-10T10:01:00.000Z");
    tx.aceNotice.findFirst.mockResolvedValue({ ...notice, publishedAt });
    tx.aceNoticeAudienceMember.count.mockResolvedValue(2);
    const { service, outbox } = createService(tx);
    await expect(
      service.publish(
        notice.id,
        {
          expectedUpdatedAt: notice.updatedAt.toISOString(),
          expectedAudienceVersion: "0".repeat(64),
        },
        actor,
      ),
    ).resolves.toEqual({ id: notice.id, publishedAt, recipientCount: 2 });
    expect(outbox.enqueue).not.toHaveBeenCalled();

    const withdrawn = await service.withdraw(
      notice.id,
      { reason: "Replaced by a correction" },
      actor,
    );
    expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    tx.aceNotice.findFirst.mockResolvedValue({
      ...notice,
      publishedAt,
      withdrawnAt: withdrawn.withdrawnAt,
    });
    await expect(
      service.withdraw(notice.id, { reason: "Retry" }, actor),
    ).resolves.toEqual(withdrawn);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(Prisma.sql).toHaveBeenCalled();
  });
});
