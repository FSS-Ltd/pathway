import { createHash } from "node:crypto";

export function financeReconciliationCaseKey(
  category: "checkout" | "reversal",
  providerId: string,
  purpose: "money" | "operation" | "refund-history" | "treatment",
): string {
  const key = `${category}:${providerId}:${purpose}`;
  if (key.length <= 255) return key;
  return `${category}:${createHash("sha256").update(providerId).digest("hex")}:${purpose}`;
}
