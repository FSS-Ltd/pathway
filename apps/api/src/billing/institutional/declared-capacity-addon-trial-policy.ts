import { calculateDeclaredCapacityQuote } from "@pathway/pricing";

export const INSTITUTIONAL_ADDON_TRIAL_DURATION_MS = 60 * 24 * 60 * 60 * 1_000;

export function declaredCapacityTrialSlots(capacity: number): number {
  const quote = calculateDeclaredCapacityQuote({
    declaredCapacity: capacity,
    interval: "month",
  });
  if (quote.kind !== "priced") {
    throw new Error("DECLARED_CAPACITY_ENTERPRISE_TRIALS_UNAVAILABLE");
  }
  return quote.trialModuleSlots;
}

export function addonTrialExpiresAt(activatedAt: Date): Date {
  if (!Number.isFinite(activatedAt.getTime())) {
    throw new Error("INVALID_ADDON_TRIAL_ACTIVATION_TIME");
  }
  return new Date(
    activatedAt.getTime() + INSTITUTIONAL_ADDON_TRIAL_DURATION_MS,
  );
}
