import { Module, ModuleGrantSource, ModuleStatus, Prisma } from "@pathway/db";

type GrantClient = Pick<Prisma.TransactionClient, "moduleGrant" | "orgModule">;

type GrantSelection = {
  included: readonly Module[];
  paid: readonly Module[];
};

export async function refreshEffectiveOrgModules(
  tx: GrantClient,
  orgId: string,
  modules: ReadonlySet<Module>,
): Promise<void> {
  const now = new Date();
  for (const module of modules) {
    const [grants, existing] = await Promise.all([
      tx.moduleGrant.findMany({
        where: { orgId, module, status: ModuleStatus.ACTIVE },
        select: { source: true, sourceId: true, expiresAt: true },
      }),
      tx.orgModule.findUnique({ where: { orgId_module: { orgId, module } } }),
    ]);
    const active = grants.filter(
      (grant) => !grant.expiresAt || grant.expiresAt > now,
    );
    if (active.length === 0) {
      if (existing?.status === ModuleStatus.ACTIVE) {
        await tx.orgModule.update({
          where: { orgId_module: { orgId, module } },
          data: { status: ModuleStatus.CANCELLED, expiresAt: now },
        });
      }
      continue;
    }

    const expiresAt = active.some((grant) => grant.expiresAt === null)
      ? null
      : new Date(
          Math.max(...active.map((grant) => grant.expiresAt!.getTime())),
        );
    const subscriptionGrant = active.find(
      (grant) =>
        grant.source === ModuleGrantSource.PLAN ||
        grant.source === ModuleGrantSource.PAID_ADDON,
    );
    const hasTrialGrant = active.some(
      (grant) => grant.source === ModuleGrantSource.TRIAL,
    );
    const metadata = {
      billingSource: subscriptionGrant
        ? "subscription"
        : hasTrialGrant
          ? "trial"
          : "manual",
      grantSources: active.map(({ source, sourceId }) => ({
        source,
        sourceId,
      })),
      ...(subscriptionGrant
        ? { subscriptionId: subscriptionGrant.sourceId }
        : {}),
    };
    await tx.orgModule.upsert({
      where: { orgId_module: { orgId, module } },
      create: {
        orgId,
        module,
        status: ModuleStatus.ACTIVE,
        activatedAt: now,
        expiresAt,
        metadata,
      },
      update: {
        status: ModuleStatus.ACTIVE,
        expiresAt,
        metadata,
      },
    });
  }
}

export async function reconcileSubscriptionModuleGrants(
  tx: GrantClient,
  orgId: string,
  subscriptionId: string,
  selection: GrantSelection,
  expiresAt: Date | null,
): Promise<void> {
  const included = new Set(selection.included);
  const paid = new Set(selection.paid);
  if ([...included].some((module) => paid.has(module))) {
    throw new Error("A module cannot be both included and paid");
  }

  const existing = await tx.moduleGrant.findMany({
    where: {
      orgId,
      sourceId: subscriptionId,
      source: { in: [ModuleGrantSource.PLAN, ModuleGrantSource.PAID_ADDON] },
    },
    select: { module: true },
  });
  const affected = new Set<Module>([
    ...existing.map(({ module }) => module),
    ...included,
    ...paid,
  ]);

  await tx.moduleGrant.updateMany({
    where: {
      orgId,
      sourceId: subscriptionId,
      source: { in: [ModuleGrantSource.PLAN, ModuleGrantSource.PAID_ADDON] },
      status: ModuleStatus.ACTIVE,
    },
    data: { status: ModuleStatus.CANCELLED },
  });

  for (const [source, modules] of [
    [ModuleGrantSource.PLAN, included],
    [ModuleGrantSource.PAID_ADDON, paid],
  ] as const) {
    for (const module of modules) {
      await tx.moduleGrant.upsert({
        where: {
          orgId_module_source_sourceId: {
            orgId,
            module,
            source,
            sourceId: subscriptionId,
          },
        },
        create: {
          orgId,
          module,
          source,
          sourceId: subscriptionId,
          status: ModuleStatus.ACTIVE,
          expiresAt,
        },
        update: { status: ModuleStatus.ACTIVE, expiresAt },
      });
    }
  }

  await refreshEffectiveOrgModules(tx, orgId, affected);
}

export async function updateSubscriptionGrantPeriod(
  tx: GrantClient,
  orgId: string,
  subscriptionId: string,
  expiresAt: Date | null,
): Promise<void> {
  const grants = await tx.moduleGrant.findMany({
    where: { orgId, sourceId: subscriptionId },
    select: { module: true },
  });
  await tx.moduleGrant.updateMany({
    where: { orgId, sourceId: subscriptionId },
    data: {
      ...(expiresAt ? { expiresAt } : { status: ModuleStatus.CANCELLED }),
    },
  });
  await refreshEffectiveOrgModules(
    tx,
    orgId,
    new Set(grants.map(({ module }) => module)),
  );
}

export async function cancelPaidSourceGrants(
  tx: GrantClient,
  orgId: string,
  sourceId: string,
  modules: readonly Module[],
): Promise<void> {
  if (modules.length === 0) return;
  await tx.moduleGrant.updateMany({
    where: {
      orgId,
      sourceId,
      source: ModuleGrantSource.PAID_ADDON,
      module: { in: [...modules] },
      status: ModuleStatus.ACTIVE,
    },
    data: { status: ModuleStatus.CANCELLED },
  });
  await refreshEffectiveOrgModules(tx, orgId, new Set(modules));
}
