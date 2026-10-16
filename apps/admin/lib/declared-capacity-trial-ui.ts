export const ADDON_TRIAL_WARNING_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

export function shouldShowAddonTrialCountdown(
  status: string,
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (status !== "ACTIVE" || !expiresAt) return false;
  const remaining = new Date(expiresAt).getTime() - now;
  return remaining > 0 && remaining <= ADDON_TRIAL_WARNING_WINDOW_MS;
}

export function trialTimeRemaining(
  expiresAt: string,
  now = Date.now(),
): string {
  const remainingHours = Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - now) / (60 * 60 * 1000)),
  );
  if (remainingHours < 24) {
    return `${remainingHours} ${remainingHours === 1 ? "hour" : "hours"} left`;
  }
  const days = Math.ceil(remainingHours / 24);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}
