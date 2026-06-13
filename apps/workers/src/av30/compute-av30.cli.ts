import "dotenv/config";
import { closePrisma } from "@pathway/db";
import { Av30ComputeJob } from "./compute-av30.job";

function parseTenantIds(): string[] {
  const raw = process.env.AV30_TENANT_IDS ?? "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function main() {
  const tenantIds = parseTenantIds();
  if (!tenantIds.length) {
    console.log("[av30] No AV30_TENANT_IDS configured; skipping computation.");
    return;
  }

  const job = new Av30ComputeJob();
  const results = await job.run(tenantIds);

  for (const result of results) {
    // Avoid PII in logs; only surface orgId and the computed count.
    console.log(
      `Org ${result.orgId}: av30=${result.av30} calculatedAt=${result.calculatedAt.toISOString()}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[av30] compute job failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrisma().catch(() => undefined);
  });
