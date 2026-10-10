import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AceNoticeDraftsService } from "../ace-notice-drafts.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "user-a" };
const revision = new Date("2026-10-10T10:00:00.000Z");
const createdAt = new Date("2026-10-09T10:00:00.000Z");
const draft = {
  id: "notice-a",
  title: "School update",
  body: "Term starts Monday",
  audience: "PARENTS" as const,
  expiresAt: null,
  createdAt,
  updatedAt: revision,
};
const content = {
  title: draft.title,
  body: draft.body,
  audience: draft.audience,
  expiresAt: null,
};

function createTransaction() {
  return {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    orgVertical: {
      findFirst: jest.fn().mockResolvedValue({ orgId: actor.orgId }),
    },
    siteMembership: {
      findFirst: jest.fn().mockResolvedValue({ id: "member-a" }),
    },
    studentIdentity: { findFirst: jest.fn().mockResolvedValue(null) },
    aceNotice: {
      create: jest.fn().mockResolvedValue(draft),
      findFirst: jest.fn().mockResolvedValue(draft),
      findMany: jest.fn().mockResolvedValue([draft]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  return { service: new AceNoticeDraftsService(), tx };
}

describe("AceNoticeDraftsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a site draft and audit event in one tenant transaction", async () => {
    const { service, tx } = createService();

    await expect(service.create(content, actor)).resolves.toEqual(draft);
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.aceNotice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: actor.tenantId,
          createdByUserId: actor.userId,
        }),
      }),
    );
    expect(tx.aceNotice.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      "publishedAt",
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "ACE_NOTICE",
          action: "CREATED",
          entityId: draft.id,
        }),
      }),
    );
  });

  it("rejects non-ACE, cross-organisation, non-member, and student authors", async () => {
    const { service, tx } = createService();
    tx.orgVertical.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(content, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.tenant.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(content, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.siteMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(content, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    tx.studentIdentity.findFirst.mockResolvedValueOnce({ id: "student-a" });
    await expect(service.create(content, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.aceNotice.create).not.toHaveBeenCalled();
  });

  it("rejects expired draft content before writing", async () => {
    const { service, tx } = createService();
    await expect(
      service.create({ ...content, expiresAt: "2020-01-01T00:00:00Z" }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.aceNotice.create).not.toHaveBeenCalled();
  });

  it("uses a scoped cursor and stable created-at ordering for bounded lists", async () => {
    const { service, tx } = createService();
    tx.aceNotice.findMany.mockResolvedValue([
      draft,
      { ...draft, id: "notice-b" },
    ]);

    await expect(
      service.list({ cursor: draft.id, limit: 1 }, actor),
    ).resolves.toEqual({
      items: [draft],
      nextCursor: draft.id,
    });
    expect(tx.aceNotice.findFirst).toHaveBeenCalledWith({
      where: { id: draft.id, tenantId: actor.tenantId, publishedAt: null },
      select: { id: true, createdAt: true },
    });
    expect(tx.aceNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          publishedAt: null,
        }),
        take: 2,
      }),
    );
  });

  it("rejects a cursor outside the active site's drafts", async () => {
    const { service, tx } = createService();
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(
      service.list({ cursor: draft.id, limit: 25 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.aceNotice.findMany).not.toHaveBeenCalled();
  });

  it("never returns a published draft or another site's draft", async () => {
    const { service, tx } = createService();
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(service.get(draft.id, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.aceNotice.findFirst).toHaveBeenCalledWith({
      where: { id: draft.id, tenantId: actor.tenantId, publishedAt: null },
      select: expect.any(Object),
    });
  });

  it("atomically checks the expected revision and audits a successful edit", async () => {
    const { service, tx } = createService();
    await expect(
      service.update(
        draft.id,
        { ...content, expectedUpdatedAt: revision.toISOString() },
        actor,
      ),
    ).resolves.toEqual(draft);
    expect(tx.aceNotice.updateMany).toHaveBeenCalledWith({
      where: {
        id: draft.id,
        tenantId: actor.tenantId,
        publishedAt: null,
        updatedAt: revision,
      },
      data: expect.objectContaining({ title: draft.title, body: draft.body }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "UPDATED" }),
      }),
    );
  });

  it("returns conflict on stale or published edits without an audit event", async () => {
    const { service, tx } = createService();
    tx.aceNotice.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update(
        draft.id,
        { ...content, expectedUpdatedAt: revision.toISOString() },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("hides another site's draft on edit", async () => {
    const { service, tx } = createService();
    tx.aceNotice.updateMany.mockResolvedValue({ count: 0 });
    tx.aceNotice.findFirst.mockResolvedValue(null);
    await expect(
      service.update(
        draft.id,
        { ...content, expectedUpdatedAt: revision.toISOString() },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
