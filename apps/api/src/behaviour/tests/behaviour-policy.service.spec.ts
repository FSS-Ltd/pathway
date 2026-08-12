import "reflect-metadata";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { CAPABILITY_DEFINITIONS } from "@pathway/platform";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { BehaviourController } from "../behaviour.controller";
import { BehaviourPolicyService } from "../behaviour-policy.service";
import { updateBehaviourPolicySchema } from "../dto/behaviour-policy.dto";

jest.mock("@pathway/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray) => strings.join(""),
  },
  withTenantRlsContext: jest.fn(),
}));

const TENANT_ID = "tenant-1";
const ORG_ID = "org-1";
const ACTOR_ID = "user-1";
const NOW = new Date("2026-08-12T12:00:00.000Z");

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

interface CategoryFixture {
  code: string;
  label: string;
  type: "MERIT" | "DEMERIT" | "GENERAL";
  visibility: "GENERAL" | "SENSITIVE";
  isActive: boolean;
  isSerious: boolean;
  sortOrder: number;
}

const currentCategories: CategoryFixture[] = [
  {
    code: "service",
    label: "Service",
    type: "MERIT",
    visibility: "GENERAL",
    isActive: true,
    isSerious: false,
    sortOrder: 1,
  },
  {
    code: "bullying",
    label: "Bullying",
    type: "DEMERIT",
    visibility: "SENSITIVE",
    isActive: true,
    isSerious: true,
    sortOrder: 2,
  },
  {
    code: "pastoral-check-in",
    label: "Pastoral check-in",
    type: "GENERAL",
    visibility: "SENSITIVE",
    isActive: false,
    isSerious: false,
    sortOrder: 3,
  },
];

function createTransaction() {
  return {
    tenant: { findFirst: jest.fn() },
    behaviourCategory: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    demeritPolicy: {
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
    auditEvent: { create: jest.fn() },
    outboxEvent: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
  };
}

function createService(tx = createTransaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  return { service: new BehaviourPolicyService(), tx };
}

function actor() {
  return { tenantId: TENANT_ID, orgId: ORG_ID, userId: ACTOR_ID };
}

function validCommand() {
  return {
    reason: "Review categories for the autumn term",
    expectedCategoryVersion: 2,
    expectedDemeritPolicyVersion: 4,
    categories: currentCategories.map((category) => ({ ...category })),
    demeritPolicy: {
      windowDays: 21,
      stageOneThreshold: 2,
      stageTwoThreshold: 5,
      stageThreeThreshold: 8,
      seriousMisconductStage: 3,
    },
  };
}

function arrangeCurrentPolicy(tx: ReturnType<typeof createTransaction>): void {
  tx.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
  tx.behaviourCategory.aggregate.mockResolvedValue({
    _max: { policyVersion: 2 },
  });
  tx.behaviourCategory.findMany.mockResolvedValue(
    currentCategories.map((category) => ({ ...category })),
  );
  tx.demeritPolicy.findFirst.mockResolvedValue(currentDemeritPolicy);
}

describe("behaviour policy boundary", () => {
  it("accepts Merit, Demerit, and General categories with visibility, inactive, and serious configuration", () => {
    expect(updateBehaviourPolicySchema.safeParse(validCommand()).success).toBe(
      true,
    );
  });

  it("rejects serious categories unless they are Demerits", () => {
    const command = validCommand();
    command.categories[0] = {
      ...command.categories[0],
      isSerious: true,
    };

    expect(updateBehaviourPolicySchema.safeParse(command).success).toBe(false);
  });

  it("rejects duplicate category codes and unordered demerit stages", () => {
    const command = validCommand();
    command.categories[1] = {
      ...command.categories[1],
      code: command.categories[0]!.code,
    };
    command.demeritPolicy.stageTwoThreshold =
      command.demeritPolicy.stageOneThreshold;

    const result = updateBehaviourPolicySchema.safeParse(command);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining([
          "categories.1.code",
          "demeritPolicy.stageTwoThreshold",
        ]),
      );
    }
  });

  it("uses existing ACE behaviour capability and permission keys on both routes", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        BehaviourController.prototype.get,
      ),
    ).toBe("ace.behaviour.read");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        BehaviourController.prototype.update,
      ),
    ).toBe("ace.behaviour.policy.manage");
    expect(CAPABILITY_DEFINITIONS["ace.behaviour.read"].requiredVertical).toBe(
      "ACE_SCHOOL",
    );
    expect(
      CAPABILITY_DEFINITIONS["ace.behaviour.policy.manage"].requiredVertical,
    ).toBe("ACE_SCHOOL");
  });
});

describe("BehaviourPolicyService", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads the latest category snapshot and active stage policy in tenant context", async () => {
    const { service, tx } = createService();
    arrangeCurrentPolicy(tx);

    await expect(service.get(actor())).resolves.toEqual({
      categoryVersion: 2,
      categories: currentCategories.map((category) => ({ ...category })),
      demeritPolicy: currentDemeritPolicy,
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      TENANT_ID,
      ORG_ID,
      expect.any(Function),
    );
    expect(tx.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: TENANT_ID, orgId: ORG_ID },
      select: { id: true },
    });
    expect(tx.behaviourCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, policyVersion: 2 },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: expect.any(Object),
    });
  });

  it("returns an empty version-zero category policy before first configuration", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ id: TENANT_ID });
    tx.behaviourCategory.aggregate.mockResolvedValue({
      _max: { policyVersion: null },
    });
    tx.demeritPolicy.findFirst.mockResolvedValue(null);

    await expect(service.get(actor())).resolves.toEqual({
      categoryVersion: 0,
      categories: [],
      demeritPolicy: null,
    });
    expect(tx.behaviourCategory.findMany).not.toHaveBeenCalled();
  });

  it("rejects an active site outside the selected organisation", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue(null);

    await expect(service.get(actor())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("appends immutable category and demerit policy versions after both CAS tokens match", async () => {
    const { service, tx } = createService();
    arrangeCurrentPolicy(tx);
    tx.demeritPolicy.aggregate.mockResolvedValue({ _max: { version: 4 } });
    tx.behaviourCategory.createMany.mockResolvedValue({ count: 3 });
    const nextDemeritPolicy = {
      ...currentDemeritPolicy,
      ...validCommand().demeritPolicy,
      version: 5,
      effectiveFrom: NOW,
    };
    tx.demeritPolicy.create.mockResolvedValue(nextDemeritPolicy);
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await expect(service.update(validCommand(), actor())).resolves.toEqual({
      categoryVersion: 3,
      categories: currentCategories.map((category) => ({ ...category })),
      demeritPolicy: nextDemeritPolicy,
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.behaviourCategory.createMany).toHaveBeenCalledWith({
      data: currentCategories.map((category) => ({
        ...category,
        tenantId: TENANT_ID,
        policyVersion: 3,
        createdByUserId: ACTOR_ID,
        reason: validCommand().reason,
      })),
    });
    expect(tx.demeritPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: TENANT_ID,
          version: 5,
          ...validCommand().demeritPolicy,
          effectiveFrom: NOW,
          effectiveTo: null,
          createdByUserId: ACTOR_ID,
          reason: validCommand().reason,
        },
      }),
    );
  });

  it("rejects stale category or stage versions before writing", async () => {
    const { service, tx } = createService();
    arrangeCurrentPolicy(tx);

    await expect(
      service.update(
        { ...validCommand(), expectedCategoryVersion: 1 },
        actor(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.behaviourCategory.createMany).not.toHaveBeenCalled();
    expect(tx.demeritPolicy.create).not.toHaveBeenCalled();
  });

  it("does not leak reason or category text into audit and outbox records", async () => {
    const { service, tx } = createService();
    arrangeCurrentPolicy(tx);
    tx.demeritPolicy.aggregate.mockResolvedValue({ _max: { version: 4 } });
    tx.behaviourCategory.createMany.mockResolvedValue({ count: 3 });
    tx.demeritPolicy.create.mockResolvedValue({
      ...currentDemeritPolicy,
      ...validCommand().demeritPolicy,
      version: 5,
      effectiveFrom: NOW,
    });
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await service.update(validCommand(), actor());

    const auditData = tx.auditEvent.create.mock.calls[0]?.[0].data;
    const outboxData = tx.outboxEvent.createMany.mock.calls[0]?.[0].data[0];
    const emitted = JSON.stringify({ auditData, outboxData });
    expect(emitted).not.toContain(validCommand().reason);
    for (const category of currentCategories) {
      expect(emitted).not.toContain(category.code);
      expect(emitted).not.toContain(category.label);
    }
    expect(auditData).toEqual(
      expect.objectContaining({
        actorUserId: ACTOR_ID,
        tenantId: TENANT_ID,
        orgId: ORG_ID,
        metadata: {
          categoryCount: 3,
          categoryVersion: 3,
          demeritPolicyVersion: 5,
        },
      }),
    );
    expect(outboxData.payload).toEqual({
      categoryCount: 3,
      categoryVersion: 3,
      demeritPolicyVersion: 5,
    });
  });

  it("maps storage uniqueness races to a safe policy conflict", async () => {
    const { service, tx } = createService();
    arrangeCurrentPolicy(tx);
    tx.behaviourCategory.createMany.mockRejectedValue({ code: "P2002" });

    await expect(
      service.update(validCommand(), actor()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects invalid commands before opening a tenant transaction", async () => {
    const { service } = createService();
    const command = validCommand();
    command.reason = "   ";

    await expect(service.update(command, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(withTenantRlsContext).not.toHaveBeenCalled();
  });
});
