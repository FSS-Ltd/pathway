export const ADD_ON_SUBSCRIPTION_PLAN_PREFIX = "ADD_ON:";

export function addOnSubscriptionPlanCode(planCode: string): string {
  return `${ADD_ON_SUBSCRIPTION_PLAN_PREFIX}${planCode}`;
}
