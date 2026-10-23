import { readFileSync } from "node:fs";
import path from "node:path";
const workflow = readFileSync(
  path.resolve(
    process.cwd(),
    "../../.github/workflows/finance-reconciliation.yml",
  ),
  "utf8",
);
describe("scheduled Finance recovery contract", () => {
  it("keeps five-minute scheduling behind the explicit approval gate and environment", () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain(
      "if: vars.ENABLE_FINANCE_RECONCILIATION == 'true'",
    );
    expect(workflow).toContain(
      "ENABLE_FINANCE_RECONCILIATION: ${{ vars.ENABLE_FINANCE_RECONCILIATION }}",
    );
    expect(workflow).toContain(
      "FINANCE_RECONCILIATION_MODE: ${{ vars.FINANCE_RECONCILIATION_MODE }}",
    );
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("cancel-in-progress: false");
  });
  it("bounds dispatch and canonical draining separately while retaining error exits", () => {
    expect(workflow).toMatch(/id: reconcile\s+timeout-minutes: 5/);
    expect(workflow).toMatch(
      /timeout-minutes: 5\s+run: pnpm --filter @pathway\/workers finance:stripe-webhooks/,
    );
    expect(workflow).toContain("steps.reconcile.outcome == 'failure'");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow.indexOf("finance:reconciliation")).toBeLessThan(
      workflow.indexOf("finance:stripe-webhooks"),
    );
    expect(workflow).toContain("timeout-minutes: 20");
  });
});
