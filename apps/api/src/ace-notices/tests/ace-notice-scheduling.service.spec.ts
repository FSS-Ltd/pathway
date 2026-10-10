import { BadRequestException, ConflictException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import { audienceVersion } from "../ace-notice-audience";
import { AceNoticeSchedulingService } from "../ace-notice-scheduling.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "manager-a" };
const revision = new Date("2026-10-10T10:00:00.000Z");
const recipients = [
  {
    recipientUserId: actor.userId,
    recipientKind: "STAFF" as const,
    guardianIdentityId: null,
  },
];
const notice = {
  id: "notice-a",
  tenantId: actor.tenantId,
  title: "Site update",
  body: "Please read this update.",
  audience: "STAFF" as const,
  audienceScope: "SITE",
  audienceTargetId: null,
  updatedAt: revision,
  scheduledAt: null as Date | null,
  scheduledByUserId: null as string | null,
  scheduledAudienceVersion: null as string | null,
  publishedAt: null,
  withdrawnAt: null,
  legacyImportedAt: null,
  expiresAt: null as Date | null,
};

function createTransaction() {
  return {
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        org: { parentPortalEnabled: true },
      }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "member-a" }),
      findMany: jest.fn().mockResolvedValue([{ userId: actor.userId }]),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    aceNotice: {
      findFirst: jest.fn().mockResolvedValue(notice),
      update: jest.fn().mockResolvedValue({ updatedAt: new Date() }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: notice.id }]),
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_site, _org, fn) => fn(tx as never));
  const outbox = { enqueue: jest.fn().mockResolvedValue({}) };
  return {
    service: new AceNoticeSchedulingService(outbox as unknown as OutboxService),
    tx,
    outbox,
  };
}

describe("AceNoticeSchedulingService", () => {
  const priorSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "test-secret-at-least-sixteen-characters";
  });

  afterAll(() => {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
  });

  it("schedules only the reviewed audience and records one lifecycle fact", async () => {
    const { service, tx, outbox } = createService();
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    const version = audienceVersion(actor.tenantId, notice.id, recipients);

    await expect(
      service.schedule(
        notice.id,
        {
          scheduledAt,
          expectedUpdatedAt: revision.toISOString(),
          expectedAudienceVersion: version,
        },
        actor,
      ),
    ).resolves.toEqual({ id: notice.id, scheduledAt: new Date(scheduledAt) });
    expect(tx.aceNotice.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: notice.id, tenantId: actor.tenantId } },
      data: expect.objectContaining({
        scheduledAt: new Date(scheduledAt),
        scheduledByUserId: actor.userId,
        scheduledAudienceVersion: version,
      }),
      select: { updatedAt: true },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed audience and an expiry before the publication time", async () => {
    const { service, tx } = createService();
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    await expect(
      service.schedule(
        notice.id,
        {
          scheduledAt,
          expectedUpdatedAt: revision.toISOString(),
          expectedAudienceVersion: "0".repeat(64),
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.aceNotice.findFirst.mockResolvedValueOnce({
      ...notice,
      expiresAt: new Date(Date.now() + 30_000),
    });
    await expect(
      service.schedule(
        notice.id,
        {
          scheduledAt,
          expectedUpdatedAt: revision.toISOString(),
          expectedAudienceVersion: audienceVersion(
            actor.tenantId,
            notice.id,
            recipients,
          ),
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.aceNotice.update).not.toHaveBeenCalled();
  });

  it("cancels a pending schedule and leaves published notices alone", async () => {
    const tx = createTransaction();
    tx.aceNotice.findFirst.mockResolvedValueOnce({
      ...notice,
      scheduledAt: new Date(Date.now() + 60_000),
    });
    const { service, outbox } = createService(tx);
    await expect(service.cancel(notice.id, actor)).resolves.toEqual({
      id: notice.id,
      scheduledAt: null,
    });
    expect(tx.aceNotice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: null,
          scheduledByUserId: null,
          scheduledAudienceVersion: null,
        }),
      }),
    );
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    await service.cancel(notice.id, actor);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    tx.aceNotice.findFirst.mockResolvedValueOnce({
      ...notice,
      publishedAt: new Date(),
    });
    await expect(service.cancel(notice.id, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("pauses only the unchanged due schedule for review", async () => {
    const tx = createTransaction();
    tx.aceNotice.findFirst.mockResolvedValue({
      ...notice,
      scheduledAt: new Date(Date.now() - 1_000),
    });
    const { service } = createService(tx);
    await expect(
      service.markFailed(notice.id, revision, "AUDIENCE_CHANGED", actor),
    ).resolves.toBe(true);
    expect(tx.aceNotice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: null,
          scheduleFailureReason: "AUDIENCE_CHANGED",
        }),
      }),
    );
    await expect(
      service.markFailed(
        notice.id,
        new Date("2026-10-10T09:00:00.000Z"),
        "AUDIENCE_CHANGED",
        actor,
      ),
    ).resolves.toBe(false);
  });
});
