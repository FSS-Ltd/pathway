import { BadRequestException } from "@nestjs/common";
import { Module } from "@pathway/db";
import {
  CONFIGURATOR_MODULE_CODES,
  INSTITUTIONAL_PLANS,
  isConfiguratorModuleReady,
  type InstitutionalPlanCode,
} from "@pathway/pricing";

export type InstitutionalModuleSelection = {
  includedModules: Module[];
  paidModules: Module[];
};

export function isInstitutionalPlanCode(
  value: string,
): value is InstitutionalPlanCode {
  return Object.hasOwn(INSTITUTIONAL_PLANS, value);
}

export function validateInstitutionalSelection(
  planCode: InstitutionalPlanCode,
  selection: InstitutionalModuleSelection,
): InstitutionalModuleSelection {
  const plan = INSTITUTIONAL_PLANS[planCode];
  if (!plan) {
    throw new BadRequestException({ code: "INVALID_PLAN" });
  }
  const included = [...selection.includedModules];
  const paid = [...selection.paidModules];
  const all = [...included, ...paid];
  if (
    included.length > plan.includedModuleSlots ||
    new Set(all).size !== all.length ||
    all.some(
      (module) =>
        !CONFIGURATOR_MODULE_CODES.includes(module) ||
        module === Module.LEARNING ||
        !isConfiguratorModuleReady(module),
    )
  ) {
    throw new BadRequestException({
      code: "MODULE_NOT_AVAILABLE",
      message: "The selected optional modules are not available.",
    });
  }
  return { includedModules: included, paidModules: paid };
}
