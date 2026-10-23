import type { FinanceRecoveryStream } from "./finance-reconciliation.types";

export interface FinanceReconciliationWindow {
  from: Date;
  to: Date;
  cursor: string | null;
  gap: { from: Date; to: Date } | null;
}

export interface StoredFinanceReconciliationWindow {
  active: Omit<FinanceReconciliationWindow, "gap"> | null;
  completedThrough: Date | null;
}

export function planReconciliationWindow(
  state: StoredFinanceReconciliationWindow,
  stream: FinanceRecoveryStream,
  now: Date,
): FinanceReconciliationWindow | null {
  const unresolved =
    stream === "unresolvedOperations" ||
    stream === "payoutContinuations" ||
    stream === "caseRequests";
  const interval = unresolved ? 5 * 60_000 : 1000;
  const cutoff = new Date(Math.floor(now.getTime() / interval) * interval);
  const day = 24 * 60 * 60 * 1000;
  if (
    !state.active &&
    state.completedThrough &&
    state.completedThrough >= cutoff
  )
    return null;

  if (unresolved)
    return {
      ...(state.active ?? { from: new Date(0), to: cutoff, cursor: null }),
      gap: null,
    };

  const requested = state.active ?? {
    from: new Date((state.completedThrough ?? cutoff).getTime() - 7 * day),
    to: cutoff,
    cursor: null,
  };
  const availableFrom = new Date(cutoff.getTime() - 30 * day);
  if (stream !== "events" || requested.from >= availableFrom)
    return { ...requested, gap: null };

  return {
    from: availableFrom,
    to: requested.to > availableFrom ? requested.to : cutoff,
    cursor: null,
    gap: { from: requested.from, to: availableFrom },
  };
}
