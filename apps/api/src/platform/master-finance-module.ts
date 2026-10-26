import {
  Module,
  ModuleGrantSource,
  ModuleStatus,
  runTransaction,
} from "@pathway/db";
import { refreshEffectiveOrgModules } from "../billing/module-grants";

/** Called after the controller verifies Master organisation and administrator access. */
export async function setMasterFinanceModule(
  orgId: string,
  active: boolean,
): Promise<{ module: Module; active: boolean }> {
  return runTransaction(async (tx) => {
    const key = {
      orgId,
      module: Module.FINANCE,
      source: ModuleGrantSource.MANUAL,
      sourceId: "master-finance",
    };
    const state = {
      status: active ? ModuleStatus.ACTIVE : ModuleStatus.CANCELLED,
      expiresAt: null,
    };
    await tx.moduleGrant.upsert({
      where: { orgId_module_source_sourceId: key },
      create: { ...key, ...state },
      update: state,
    });
    await refreshEffectiveOrgModules(tx, orgId, new Set([Module.FINANCE]));
    return { module: Module.FINANCE, active };
  });
}
