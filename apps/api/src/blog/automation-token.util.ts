import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateAutomationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashAutomationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
