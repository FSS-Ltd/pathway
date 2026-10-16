export const DECLARED_CAPACITY_TRIAL_REVIEW_EVENT =
  "nexsteps:declared-capacity-addon-review";

export function requestDeclaredCapacityTrialReview(module: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DECLARED_CAPACITY_TRIAL_REVIEW_EVENT, {
      detail: { module },
    }),
  );
}
