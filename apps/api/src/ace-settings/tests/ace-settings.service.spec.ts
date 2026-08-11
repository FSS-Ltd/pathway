import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { updateAceSettingsSchema } from "../dto/ace-settings.dto";
import { AceSettingsService } from "../ace-settings.service";

jest.mock("@pathway/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray) => strings.join(""),
  },
  withTenantRlsContext: jest.fn(),
}));

const TENANT_ID = "tenant-1";
const ORG_ID = "org-1";
const ACTOR_ID = "user-1";
const NOW = new Date("2026-08-11T12:00:00.000Z");

const currentPacePolicy = {
  id: "pace-policy-1",
  version: 2,
  selfTestPassingScore: 80,
  paceTestPassingScore: 80,
  maxAssessmentsPerDay: 2,
  allowSamePaceSameDay: false,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
};

const currentDemeritPolicy = {
  id: "demerit-policy-1",
  version: 4,
  windowDays: 30,
  stageOneThreshold: 3,
  stageTwoThreshold: 6,
  stageThreeThreshold: 9,
  seriousMisconductStage: 3,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
};

function createTransaction() {
  return {
    tenant: { findFirst: jest.fn() },
    pacePolicy: {
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    demeritPolicy: {
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    aceCommunityPolicy: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $executeRaw: jest.fn(),
    auditEvent: { create: jest.fn() },
    outboxEvent: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
  };
}

function createService(tx = createTransaction()) {
  jest.mocked(withTenantRlsContext).mockImplementation(
    async (_tenantId, _orgId, callback) => callback(tx as never),
  );
  return { service: new AceSettingsService(), tx };
}

function actor() {
  return { tenantId: TENANT_ID, orgId: ORG_ID, userId: ACTOR_ID };
}

function validPaceChange() {
  return {
    selfTestPassingScore: 85,
    paceTestPassingScore: 90,
    maxAssessmentsPerDay: 3,
    allowSamePaceSameDay: false,
  };
}

function validDemeritChange() {
  return {
    windowDays: 21,
    stageOneThreshold: 2,
    stageTwoThreshold: 4,
    stageThreeThreshold: 6,
    seriousMisconductStage: 3,
  };
}

describe("AceSettingsService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads only the active tenant's validated timezone and current settings", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue({
      communityEnabled: true,
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    });

    await expect(service.get(actor())).resolves.toEqual({
      timezone: "Europe/London",
      pacePolicy: currentPacePolicy,
      demeritPolicy: currentDemeritPolicy,
      features: {
        "ace.student_community": {
          enabled: true,
          updatedAt: "2026-08-10T00:00:00.000Z",
        },
      },
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
      expect.any(Function),
    );
    expect(tx.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: TENANT_ID, orgId: ORG_ID },
      select: { timezone: true },
    });
    expect(tx.pacePolicy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
      }),
    );
  });

  it("rejects an invalid tenant timezone rather than returning a corrupt setting", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Mars/Olympus" });

    await expect(service.get(actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects access when the selected tenant is outside the organisation", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(service.get(actor())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("appends an immediately effective PACE policy after its expected version matches", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.pacePolicy.aggregate.mockResolvedValue({ _max: { version: 2 } });
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue(null);
    tx.pacePolicy.create.mockResolvedValue({
      ...currentPacePolicy,
      version: 3,
      ...validPaceChange(),
      effectiveFrom: NOW,
    });
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await service.update(
      {
        reason: "Align assessment rules for September",
        expectedPacePolicyVersion: 2,
        expectedDemeritPolicyVersion: 4,
        pacePolicy: validPaceChange(),
      },
      actor(),
    );

    expect(tx.pacePolicy.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: TENANT_ID,
        version: 3,
        effectiveFrom: NOW,
        effectiveTo: null,
        createdByUserId: ACTOR_ID,
        reason: "Align assessment rules for September",
        ...validPaceChange(),
      }),
    }));
  });

  it("rejects stale PACE and demerit policy versions with a conflict", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        {
          reason: "Attempt an out-of-date update",
          expectedPacePolicyVersion: 1,
          expectedDemeritPolicyVersion: 3,
          pacePolicy: validPaceChange(),
          demeritPolicy: validDemeritChange(),
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pacePolicy.create).not.toHaveBeenCalled();
    expect(tx.demeritPolicy.create).not.toHaveBeenCalled();
  });

  it("rejects stale policy versions even when only the community feature changes", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        {
          reason: "Enable supervised student community",
          expectedPacePolicyVersion: 1,
          expectedDemeritPolicyVersion: 4,
          features: {
            "ace.student_community": {
              enabled: true,
              expectedUpdatedAt: null,
            },
          },
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.aceCommunityPolicy.create).not.toHaveBeenCalled();
  });

  it("rejects invalid demerit thresholds before storing policy history", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        {
          reason: "Invalid threshold order",
          expectedPacePolicyVersion: 2,
          expectedDemeritPolicyVersion: 4,
          demeritPolicy: {
            ...validDemeritChange(),
            stageTwoThreshold: 2,
          },
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.demeritPolicy.create).not.toHaveBeenCalled();
  });

  it("changes only the supported community feature with its updatedAt token", async () => {
    const { service, tx } = createService();
    const featureUpdatedAt = new Date("2026-08-10T00:00:00.000Z");
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue({
      communityEnabled: false,
      updatedAt: featureUpdatedAt,
    });
    tx.aceCommunityPolicy.updateMany.mockResolvedValue({ count: 1 });
    tx.aceCommunityPolicy.findFirst.mockResolvedValue({
      communityEnabled: true,
      updatedAt: NOW,
    });
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await service.update(
      {
        reason: "Enable supervised student community",
        expectedPacePolicyVersion: 2,
        expectedDemeritPolicyVersion: 4,
        features: {
          "ace.student_community": {
            enabled: true,
            expectedUpdatedAt: featureUpdatedAt.toISOString(),
          },
        },
      },
      actor(),
    );

    expect(tx.aceCommunityPolicy.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, updatedAt: featureUpdatedAt },
      data: { communityEnabled: true },
    });
  });

  it("rejects an empty settings command without audit or outbox writes", async () => {
    const { service, tx } = createService();

    await expect(
      service.update(
        {
          reason: "No permitted settings",
          expectedPacePolicyVersion: 0,
          expectedDemeritPolicyVersion: 0,
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects unknown settings keys at the API boundary", () => {
    const result = updateAceSettingsSchema.safeParse({
      reason: "Unsupported settings are not accepted",
      expectedPacePolicyVersion: 0,
      expectedDemeritPolicyVersion: 0,
      unsupportedSetting: true,
    });

    expect(result.success).toBe(false);
  });

  it("writes audit and outbox records in the same tenant transaction without the reason or policy values", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.pacePolicy.findFirst.mockResolvedValue(currentPacePolicy);
    tx.pacePolicy.aggregate.mockResolvedValue({ _max: { version: 2 } });
    tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
    tx.aceCommunityPolicy.findUnique.mockResolvedValue(null);
    tx.pacePolicy.create.mockResolvedValue({
      ...currentPacePolicy,
      version: 3,
      ...validPaceChange(),
      effectiveFrom: NOW,
    });
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await service.update(
      {
        reason: "A sensitive administrative explanation",
        expectedPacePolicyVersion: 2,
        expectedDemeritPolicyVersion: 4,
        pacePolicy: validPaceChange(),
      },
      actor(),
    );

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: ACTOR_ID,
        tenantId: TENANT_ID,
        orgId: ORG_ID,
      }),
    });
    const outboxPayload = jest.mocked(tx.outboxEvent.createMany).mock.calls[0]?.[0]
      .data[0].payload;
    expect(outboxPayload).toEqual({ changedSections: ["pacePolicy"] });
  });
});
