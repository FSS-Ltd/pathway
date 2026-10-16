import type { DeclaredCapacityInterval } from "@pathway/pricing";
import type {
  DeclaredCapacityAddonModule,
  DeclaredCapacityAddonOption,
} from "../../lib/institutional-estimate-client";

export type DeclaredCapacityAddonChoice = "none" | "trial" | "pay-now";

export type DeclaredCapacityAddonSelection = Readonly<{
  trialModules: DeclaredCapacityAddonModule[];
  payNowModules: DeclaredCapacityAddonModule[];
}>;

export function setDeclaredCapacityAddonChoice(
  current: DeclaredCapacityAddonSelection,
  option: DeclaredCapacityAddonOption,
  choice: DeclaredCapacityAddonChoice,
  interval: DeclaredCapacityInterval,
  trialModuleSlots: number,
): DeclaredCapacityAddonSelection {
  const hasTrial = current.trialModules.includes(option.module);
  const trialModules = current.trialModules.filter(
    (module) => module !== option.module,
  );
  const payNowModules = current.payNowModules.filter(
    (module) => module !== option.module,
  );

  if (choice === "trial") {
    if (
      !option.trialAvailable ||
      (!hasTrial && current.trialModules.length >= trialModuleSlots)
    ) {
      return current;
    }
    return { trialModules: [...trialModules, option.module], payNowModules };
  }

  if (choice === "pay-now") {
    const price =
      interval === "year" ? option.yearlyPricePence : option.monthlyPricePence;
    if (price === null) return current;
    return { trialModules, payNowModules: [...payNowModules, option.module] };
  }

  if (!hasTrial && !current.payNowModules.includes(option.module))
    return current;
  return { trialModules, payNowModules };
}
