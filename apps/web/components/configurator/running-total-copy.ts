import type { ConfiguratorState } from "../../app/configure/state";

export function formatRunningTotal(
  amount: number | null,
  frequency: ConfiguratorState["frequency"],
): { label: string; amount: number | null } {
  if (amount === null) {
    return { label: "Select a plan to see your total", amount: null };
  }

  return {
    label: `Total per ${frequency === "monthly" ? "month" : "year"}`,
    amount,
  };
}
