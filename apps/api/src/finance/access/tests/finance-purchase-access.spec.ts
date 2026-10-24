import { ForbiddenException } from "@nestjs/common";
import { Module, ModuleGrantSource, ModuleStatus } from "@pathway/db";
import type { EffectivePermissionsService } from "../../../access-control/effective-permissions.service";
import {
  cancelPaidSourceGrants,
  reconcileSubscriptionModuleGrants,
} from "../../../billing/module-grants";
import type { FinanceAccessReader } from "../finance-access.reader";
import { FinanceAccessService } from "../finance-access.service";

type Grant = {
  orgId: string;
  module: Module;
  source: ModuleGrantSource;
  sourceId: string;
  status: ModuleStatus;
  expiresAt: Date | null;
};
type Projection = { status: ModuleStatus; expiresAt: Date | null };

/** Minimal in-memory store for the real grant functions: grants in, org modules out. */
function store() {
  const grants: Grant[] = [];
  const modules = new Map<string, Projection>();
  const key = (orgId: string, module: Module) => `${orgId}:${module}`;
  const inList = <T>(value: unknown, list: T[]) =>
    typeof value === "object" && value !== null && "in" in value
      ? (value as { in: T[] }).in.includes(list[0])
      : true;
  const matches = (grant: Grant, where: Record<string, unknown>) =>
    where.orgId === grant.orgId &&
    (where.sourceId === undefined || where.sourceId === grant.sourceId) &&
    (where.status === undefined || where.status === grant.status) &&
    (typeof where.module !== "string" || where.module === grant.module) &&
    inList(where.module, [grant.module]) &&
    (typeof where.source === "string"
      ? where.source === grant.source
      : inList(where.source, [grant.source]));
  const tx = {
    moduleGrant: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        grants.filter((grant) => matches(grant, where)),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Grant>;
      }) => {
        for (const grant of grants.filter((row) => matches(row, where))) {
          Object.assign(grant, data);
        }
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          orgId_module_source_sourceId: Pick<
            Grant,
            "orgId" | "module" | "source" | "sourceId"
          >;
        };
        create: Grant;
        update: Partial<Grant>;
      }) => {
        const id = where.orgId_module_source_sourceId;
        const found = grants.find(
          (grant) =>
            grant.orgId === id.orgId &&
            grant.module === id.module &&
            grant.source === id.source &&
            grant.sourceId === id.sourceId,
        );
        if (found) Object.assign(found, update);
        else grants.push({ ...create });
      },
    },
    orgModule: {
      findUnique: async ({
        where,
      }: {
        where: { orgId_module: { orgId: string; module: Module } };
      }) =>
        modules.get(key(where.orgId_module.orgId, where.orgId_module.module)) ??
        null,
      update: async ({
        where,
        data,
      }: {
        where: { orgId_module: { orgId: string; module: Module } };
        data: Partial<Projection>;
      }) => {
        const id = key(where.orgId_module.orgId, where.orgId_module.module);
        modules.set(id, { ...modules.get(id)!, ...data });
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { orgId_module: { orgId: string; module: Module } };
        create: Projection;
        update: Partial<Projection>;
      }) => {
        const id = key(where.orgId_module.orgId, where.orgId_module.module);
        modules.set(id, { ...(modules.get(id) ?? create), ...update });
      },
    },
  };
  return { tx: tx as never, modules };
}

describe("Finance entitlement from purchase to access", () => {
  const orgId = "org-a";
  const scope = { tenantId: "tenant-a", orgId };

  function access(modules: Map<string, Projection>) {
    const reader: FinanceAccessReader = {
      findModule: async ({ orgId: id }) =>
        modules.get(`${id}:${Module.FINANCE}`) ?? null,
      hasPayerGrant: async () => false,
      hasReceipt: async () => false,
    };
    const permissions = {
      resolve: async () => ({ allowed: true }),
    } as unknown as EffectivePermissionsService;
    return new FinanceAccessService(reader, permissions);
  }

  it("keeps Finance locked for a school that has not purchased it", async () => {
    const { modules } = store();
    await expect(
      access(modules).assertStaffAction(scope, "CREATE_INVOICE"),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ["a paid Finance add-on", { included: [], paid: [Module.FINANCE] }],
    ["a plan that includes Finance", { included: [Module.FINANCE], paid: [] }],
  ])("unlocks Finance for %s", async (_label, selection) => {
    const { tx, modules } = store();
    await reconcileSubscriptionModuleGrants(
      tx,
      orgId,
      "sub_1",
      selection,
      null,
    );
    const service = access(modules);
    await expect(
      service.assertStaffAction(scope, "CREATE_INVOICE"),
    ).resolves.toBeUndefined();
    await expect(service.resolveMode(scope)).resolves.toBe("ACTIVE");
  });

  it("does not unlock Finance for other paid modules", async () => {
    const { tx, modules } = store();
    await reconcileSubscriptionModuleGrants(
      tx,
      orgId,
      "sub_1",
      { included: [], paid: [Module.EVENTS] },
      null,
    );
    await expect(
      access(modules).assertStaffAction(scope, "CREATE_INVOICE"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("moves a cancelled add-on to servicing: reads continue, new invoices stop", async () => {
    const { tx, modules } = store();
    await reconcileSubscriptionModuleGrants(
      tx,
      orgId,
      "sub_1",
      { included: [], paid: [Module.FINANCE] },
      null,
    );
    await cancelPaidSourceGrants(tx, orgId, "sub_1", [Module.FINANCE]);
    const service = access(modules);
    await expect(service.resolveMode(scope)).resolves.toBe("SERVICING_ONLY");
    await expect(
      service.assertStaffAction(scope, "EXPORT_REPORT"),
    ).resolves.toBeUndefined();
    await expect(
      service.assertStaffAction(scope, "CREATE_INVOICE"),
    ).rejects.toThrow(ForbiddenException);
  });
});
