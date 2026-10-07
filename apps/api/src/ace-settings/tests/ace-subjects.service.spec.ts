import { ConflictException, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AceSubjectsService } from "../ace-subjects.service";

jest.mock("@pathway/db", () => ({ withTenantRlsContext: jest.fn() }));

const actor = { tenantId: "site-a", orgId: "org-a", userId: "user-a" };
const subject = { id: "subject-a", name: "Mathematics", isActive: true };

function createTransaction() {
  return {
    tenant: { findFirst: jest.fn().mockResolvedValue({ id: actor.tenantId }) },
    subject: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  return { service: new AceSubjectsService(), tx };
}

describe("AceSubjectsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists only the trusted active site's subjects", async () => {
    const { service, tx } = createService();
    tx.subject.findMany.mockResolvedValue([subject]);

    await expect(service.list(actor)).resolves.toEqual([subject]);
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      actor.tenantId,
      actor.orgId,
      expect.any(Function),
    );
    expect(tx.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: actor.tenantId } }),
    );
  });

  it("creates an active subject and audit event in the same site transaction", async () => {
    const { service, tx } = createService();
    tx.subject.create.mockResolvedValue(subject);
    tx.auditEvent.create.mockResolvedValue({});

    await expect(
      service.create(
        { name: subject.name, reason: "Add core PACE subject" },
        actor,
      ),
    ).resolves.toEqual(subject);
    expect(tx.subject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { tenantId: actor.tenantId, name: subject.name, isActive: true },
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityId: subject.id,
          action: "CREATED",
          metadata: expect.objectContaining({
            reason: "Add core PACE subject",
          }),
        }),
      }),
    );
  });

  it("rejects a selected site outside the active organisation", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(service.list(actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.subject.findMany).not.toHaveBeenCalled();
  });

  it("hides a subject from another site on rename", async () => {
    const { service, tx } = createService();
    tx.subject.findFirst.mockResolvedValue(null);

    await expect(
      service.rename(subject.id, { name: "Maths", reason: "Rename" }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.subject.findFirst).toHaveBeenCalledWith({
      where: { id: subject.id, tenantId: actor.tenantId },
      select: { id: true, name: true, isActive: true },
    });
    expect(tx.subject.update).not.toHaveBeenCalled();
  });

  it("maps a duplicate site subject name to a conflict", async () => {
    const { service, tx } = createService();
    tx.subject.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create({ name: subject.name, reason: "Duplicate" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("deactivates a subject without deleting its existing records", async () => {
    const { service, tx } = createService();
    tx.subject.findFirst.mockResolvedValue(subject);
    tx.subject.update.mockResolvedValue({ ...subject, isActive: false });
    tx.auditEvent.create.mockResolvedValue({});

    await expect(
      service.deactivate(subject.id, { reason: "No new placements" }, actor),
    ).resolves.toEqual({ ...subject, isActive: false });
    expect(tx.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: { id: subject.id, tenantId: actor.tenantId },
          isActive: true,
        },
        data: { isActive: false },
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("returns a conflict when a subject changes during deactivation", async () => {
    const { service, tx } = createService();
    tx.subject.findFirst.mockResolvedValue(subject);
    tx.subject.update.mockRejectedValue({ code: "P2025" });

    await expect(
      service.deactivate(subject.id, { reason: "No new placements" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
