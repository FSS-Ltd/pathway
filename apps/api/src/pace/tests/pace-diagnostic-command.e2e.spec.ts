import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { PaceDiagnosticCommandService } from "../pace-diagnostic-command.service";

describe("ACE diagnostic command transaction", () => {
  const orgId = randomUUID();
  const tenantId = randomUUID();
  const otherSiteId = randomUUID();
  const userId = randomUUID();
  const childId = randomUUID();
  const subjectId = randomUUID();
  const enrollmentId = randomUUID();
  const actor = { orgId, tenantId, userId };
  const command = { childId, subjectId, level: 3, outcome: "PASS" as const };
  const resultIds: string[] = [];
  const service = new PaceDiagnosticCommandService(new OutboxService());

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Diagnostic command test",
        slug: `diagnostic-command-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantId,
          orgId,
          name: "Diagnostic site",
          slug: `diagnostic-${tenantId}`,
        },
        {
          id: otherSiteId,
          orgId,
          name: "Other site",
          slug: `diagnostic-${otherSiteId}`,
        },
      ],
    });
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.user.create({
        data: { id: userId, email: `${userId}@example.test`, tenantId },
      });
      await tx.siteMembership.create({ data: { tenantId, userId } });
      await tx.child.create({
        data: { id: childId, tenantId, firstName: "Test", lastName: "Child" },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId, name: "Diagnostic subject" },
      });
      await tx.studentSubjectEnrollment.create({
        data: {
          id: enrollmentId,
          tenantId,
          childId,
          subjectId,
          startsOn: new Date("2026-01-01T00:00:00.000Z"),
          startingPace: 1001,
          currentPace: 1001,
          targetPace: 1010,
          recordedByUserId: userId,
          reason: "Initial placement",
        },
      });
    });
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateType: "pace_diagnostic",
        aggregateId: { in: resultIds },
      },
    });
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PaceDiagnosticRetraction", "PaceDiagnosticResult"',
    );
    await prisma.studentSubjectEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "ACTIVE", endsOn: null },
    });
    resultIds.length = 0;
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.studentSubjectEnrollment.delete({
      where: { id: enrollmentId },
    });
    await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.child.delete({ where: { id: childId } });
    await prisma.siteMembership.delete({
      where: { tenantId_userId: { tenantId, userId } },
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherSiteId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("commits a result, audit and outbox event without changing placement", async () => {
    if (!isDatabaseAvailable()) return;
    const result = await service.record(actor, command);
    resultIds.push(result.id);

    const stored = await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const [fact, audit, outbox, enrollment] = await Promise.all([
        tx.paceDiagnosticResult.findFirst({ where: { id: result.id } }),
        tx.auditEvent.findMany({ where: { entityId: result.id } }),
        tx.outboxEvent.findMany({ where: { aggregateId: result.id } }),
        tx.studentSubjectEnrollment.findUnique({ where: { id: enrollmentId } }),
      ]);
      return { fact, audit, outbox, enrollment };
    });
    expect(stored.fact?.level).toBe(3);
    expect(stored.audit).toHaveLength(1);
    expect(stored.outbox).toHaveLength(1);
    expect(stored.enrollment?.currentPace).toBe(1001);
  });

  it("rolls back the fact and audit when outbox insertion fails", async () => {
    if (!isDatabaseAvailable()) return;
    const failingOutbox = new OutboxService();
    jest
      .spyOn(failingOutbox, "enqueue")
      .mockRejectedValueOnce(new Error("outbox failed"));
    await expect(
      new PaceDiagnosticCommandService(failingOutbox).record(actor, command),
    ).rejects.toThrow("outbox failed");

    const counts = await withTenantRlsContext(tenantId, orgId, async (tx) => ({
      facts: await tx.paceDiagnosticResult.count({ where: { tenantId } }),
      audits: await tx.auditEvent.count({ where: { tenantId } }),
    }));
    expect(counts).toEqual({ facts: 0, audits: 0 });
  });

  it("rolls back a retraction and its audit when outbox insertion fails", async () => {
    if (!isDatabaseAvailable()) return;
    const result = await service.record(actor, command);
    resultIds.push(result.id);
    const failingOutbox = new OutboxService();
    jest
      .spyOn(failingOutbox, "enqueue")
      .mockRejectedValueOnce(new Error("outbox failed"));
    await expect(
      new PaceDiagnosticCommandService(failingOutbox).retract(
        actor,
        result.id,
        {
          reason: "Wrong sheet",
        },
      ),
    ).rejects.toThrow("outbox failed");

    const counts = await withTenantRlsContext(tenantId, orgId, async (tx) => ({
      retractions: await tx.paceDiagnosticRetraction.count({
        where: { tenantId },
      }),
      audits: await tx.auditEvent.count({ where: { tenantId } }),
      outbox: await tx.outboxEvent.count({ where: { aggregateId: result.id } }),
    }));
    expect(counts).toEqual({ retractions: 0, audits: 1, outbox: 1 });
  });

  it("retracts after enrollment ends and denies a switched site or second retraction", async () => {
    if (!isDatabaseAvailable()) return;
    const result = await service.record(actor, command);
    resultIds.push(result.id);
    await prisma.studentSubjectEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "ENDED", endsOn: new Date("2026-10-06T00:00:00.000Z") },
    });

    await expect(
      service.retract({ ...actor, tenantId: otherSiteId }, result.id, {
        reason: "Wrong sheet",
      }),
    ).rejects.toThrow("Diagnostic result not found");
    await expect(
      service.retract(actor, result.id, { reason: "Wrong sheet" }),
    ).resolves.toMatchObject({ resultId: result.id });
    await expect(
      service.retract(actor, result.id, { reason: "Again" }),
    ).rejects.toThrow("Diagnostic result already retracted");

    const counts = await withTenantRlsContext(tenantId, orgId, async (tx) => ({
      facts: await tx.paceDiagnosticResult.count({ where: { tenantId } }),
      retractions: await tx.paceDiagnosticRetraction.count({
        where: { tenantId },
      }),
      audits: await tx.auditEvent.count({ where: { tenantId } }),
      outbox: await tx.outboxEvent.count({ where: { aggregateId: result.id } }),
    }));
    expect(counts).toEqual({ facts: 1, retractions: 1, audits: 2, outbox: 2 });
  });
});
