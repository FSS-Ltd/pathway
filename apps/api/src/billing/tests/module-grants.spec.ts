import { Module, ModuleGrantSource, ModuleStatus, Prisma } from "@pathway/db";
import {
  cancelPaidSourceGrants,
  reconcileSubscriptionModuleGrants,
  updateSubscriptionGrantPeriod,
} from "../module-grants";

type Grant = {
  orgId: string;
  module: Module;
  source: ModuleGrantSource;
  sourceId: string;
  status: ModuleStatus;
  expiresAt: Date | null;
};

function fakeClient(initial: Grant[]) {
  const grants = initial.map((grant) => ({ ...grant }));
  const projections = new Map<Module, { status: ModuleStatus; metadata: unknown }>();
  const matches = (grant: Grant, where: Record<string, unknown>) => {
    if (where.orgId !== grant.orgId) return false;
    if (typeof where.module === "string" && where.module !== grant.module) return false;
    if (where.sourceId && where.sourceId !== grant.sourceId) return false;
    if (where.status && where.status !== grant.status) return false;
    if (where.module && typeof where.module === "object" &&
      !(where.module as { in: Module[] }).in.includes(grant.module)) return false;
    const source = where.source as { in?: ModuleGrantSource[] } | undefined;
    return (!source || (typeof source === "string" ? source === grant.source :
      !source.in || source.in.includes(grant.source)));
  };
  const tx = {
    moduleGrant: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        grants.filter((grant) => matches(grant, where))),
      updateMany: jest.fn(async ({ where, data }: {
        where: Record<string, unknown>;
        data: Partial<Grant>;
      }) => {
        for (const grant of grants.filter((row) => matches(row, where))) {
          Object.assign(grant, data);
        }
      }),
      upsert: jest.fn(async ({ where, create, update }: {
        where: { orgId_module_source_sourceId: Pick<Grant, "orgId" | "module" | "source" | "sourceId"> };
        create: Grant;
        update: Partial<Grant>;
      }) => {
        const key = where.orgId_module_source_sourceId;
        const found = grants.find((grant) =>
          grant.orgId === key.orgId && grant.module === key.module &&
          grant.source === key.source && grant.sourceId === key.sourceId);
        if (found) Object.assign(found, update);
        else grants.push({ ...create });
      }),
    },
    orgModule: {
      findUnique: jest.fn(async ({ where }: { where: { orgId_module: { module: Module } } }) =>
        projections.get(where.orgId_module.module) ?? null),
      upsert: jest.fn(async ({ where, create, update }: {
        where: { orgId_module: { module: Module } };
        create: { status: ModuleStatus; metadata: unknown };
        update: { status: ModuleStatus; metadata: unknown };
      }) => {
        projections.set(where.orgId_module.module, projections.has(where.orgId_module.module) ? update : create);
      }),
      update: jest.fn(async ({ where, data }: {
        where: { orgId_module: { module: Module } };
        data: { status: ModuleStatus };
      }) => {
        const existing = projections.get(where.orgId_module.module);
        if (existing) existing.status = data.status;
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, grants, projections };
}

const future = new Date("2030-01-01T00:00:00.000Z");

describe("subscription module grants", () => {
  it("moves a paid module into an included slot without losing another grant", async () => {
    const { tx, grants, projections } = fakeClient([
      { orgId: "org_1", module: Module.FINANCE, source: ModuleGrantSource.PAID_ADDON,
        sourceId: "sub_base", status: ModuleStatus.ACTIVE, expiresAt: future },
      { orgId: "org_1", module: Module.FINANCE, source: ModuleGrantSource.MANUAL,
        sourceId: "manual_1", status: ModuleStatus.ACTIVE, expiresAt: null },
    ]);

    await reconcileSubscriptionModuleGrants(tx, "org_1", "sub_base", {
      included: [Module.FINANCE], paid: [],
    }, future);

    expect(grants.find((grant) => grant.source === ModuleGrantSource.PAID_ADDON)?.status)
      .toBe(ModuleStatus.CANCELLED);
    expect(grants.find((grant) => grant.source === ModuleGrantSource.PLAN)?.status)
      .toBe(ModuleStatus.ACTIVE);
    expect(projections.get(Module.FINANCE)?.status).toBe(ModuleStatus.ACTIVE);
  });

  it("cancels only the ending subscription's grant", async () => {
    const { tx, grants, projections } = fakeClient([
      { orgId: "org_1", module: Module.EVENTS, source: ModuleGrantSource.PLAN,
        sourceId: "sub_old", status: ModuleStatus.ACTIVE, expiresAt: future },
      { orgId: "org_1", module: Module.EVENTS, source: ModuleGrantSource.PAID_ADDON,
        sourceId: "sub_other", status: ModuleStatus.ACTIVE, expiresAt: future },
    ]);

    await updateSubscriptionGrantPeriod(tx, "org_1", "sub_old", null);

    expect(grants.find((grant) => grant.sourceId === "sub_old")?.status)
      .toBe(ModuleStatus.CANCELLED);
    expect(grants.find((grant) => grant.sourceId === "sub_other")?.status)
      .toBe(ModuleStatus.ACTIVE);
    expect(projections.get(Module.EVENTS)?.status).toBe(ModuleStatus.ACTIVE);
  });

  it("removes the effective module when its last grant ends", async () => {
    const { tx, projections } = fakeClient([
      { orgId: "org_1", module: Module.EVENTS, source: ModuleGrantSource.PAID_ADDON,
        sourceId: "sub_old", status: ModuleStatus.ACTIVE, expiresAt: future },
    ]);
    await updateSubscriptionGrantPeriod(tx, "org_1", "sub_old", future);
    expect(projections.get(Module.EVENTS)?.status).toBe(ModuleStatus.ACTIVE);

    await updateSubscriptionGrantPeriod(tx, "org_1", "sub_old", null);
    expect(projections.get(Module.EVENTS)?.status).toBe(ModuleStatus.CANCELLED);
  });

  it("retires an external paid grant while preserving the new included grant", async () => {
    const { tx, grants, projections } = fakeClient([
      { orgId: "org_1", module: Module.FINANCE, source: ModuleGrantSource.PAID_ADDON,
        sourceId: "sub_addon", status: ModuleStatus.ACTIVE, expiresAt: future },
    ]);
    await reconcileSubscriptionModuleGrants(tx, "org_1", "sub_base",
      { included: [Module.FINANCE], paid: [] }, future);
    await cancelPaidSourceGrants(tx, "org_1", "sub_addon", [Module.FINANCE]);
    expect(grants.find((grant) => grant.sourceId === "sub_addon")?.status)
      .toBe(ModuleStatus.CANCELLED);
    expect(projections.get(Module.FINANCE)?.status).toBe(ModuleStatus.ACTIVE);
    expect(projections.get(Module.FINANCE)?.metadata).toEqual(expect.objectContaining({
      grantSources: [{ source: ModuleGrantSource.PLAN, sourceId: "sub_base" }],
    }));
  });
});
