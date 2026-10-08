/**
 * Provisions the Phase 0 (PR 0.2) Stripe Products/Prices for the four-tier
 * pricing migration and prints the STRIPE_PRICE_MAP / STRIPE_PRICE_MAP_TEST
 * entries to paste into deployment secrets.
 *
 * Safe to run repeatedly: uses deterministic Stripe idempotency keys, so
 * re-running never creates duplicate Products/Prices.
 *
 * Usage:
 *   tsx scripts/stripe-provision-phase0-plans.ts                 # dry run, no API calls, no key required
 *   tsx scripts/stripe-provision-phase0-plans.ts --apply          # creates in Stripe TEST mode (needs STRIPE_SECRET_KEY_TEST)
 *   tsx scripts/stripe-provision-phase0-plans.ts --apply --live   # creates in Stripe LIVE mode (needs STRIPE_SECRET_KEY) - real money, real customers
 */
import { config } from "dotenv";
import path from "node:path";
import Stripe from "stripe";
import type { PlanCode } from "../src/billing/billing-plans";

// Same pattern as apps/api/src/main.ts: load .env from cwd (e.g. apps/api)
// first, then fall back to the repo-root .env for anything not already set.
config();
config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const apply = process.argv.includes("--apply");
const live = process.argv.includes("--live");

// Keep in sync with packages/pricing/src/catalog.ts and
// apps/api/src/billing/billing-plans.ts. Phase 0's catalogue is intentionally
// duplicated across four files (accepted debt, not fixed in this phase - see
// docs/NexStepsV2/00-foundation-versioning-and-plans.md) so this is a fifth,
// deliberately hand-checked copy rather than a new cross-app dependency for
// a one-off provisioning script.
type TierSpec = {
  product: string;
  av30Included: number;
  monthly: { code: PlanCode; amountGbp: number };
  yearly: { code: PlanCode; amountGbp: number };
};

const TIERS: TierSpec[] = [
  {
    product: "Nexsteps Starter",
    av30Included: 50,
    monthly: { code: "STARTER_49_MONTHLY", amountGbp: 49 },
    yearly: { code: "STARTER_49_YEARLY", amountGbp: 490 },
  },
  {
    product: "Nexsteps Growth",
    av30Included: 100,
    monthly: { code: "GROWTH_99_MONTHLY", amountGbp: 99 },
    yearly: { code: "GROWTH_99_YEARLY", amountGbp: 990 },
  },
  {
    product: "Nexsteps Professional",
    av30Included: 200,
    monthly: { code: "PROFESSIONAL_149_MONTHLY", amountGbp: 149 },
    yearly: { code: "PROFESSIONAL_149_YEARLY", amountGbp: 1490 },
  },
];

async function main(): Promise<void> {
  const mode = !apply ? "dry-run" : live ? "apply (LIVE)" : "apply (test)";
  console.log(`[stripe-provision-phase0] mode=${mode}`);
  if (!apply) {
    console.log(
      "Pass --apply to create these in Stripe test mode, or --apply --live for production. No API calls made.\n",
    );
  }

  const secretKey = live
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST;
  if (apply && !secretKey) {
    throw new Error(
      live
        ? "STRIPE_SECRET_KEY is required with --apply --live."
        : "STRIPE_SECRET_KEY_TEST is required with --apply (test mode is the default - pass --live for production, which requires STRIPE_SECRET_KEY instead).",
    );
  }

  const stripe = apply
    ? new Stripe(secretKey as string, { apiVersion: "2023-10-16" })
    : null;
  const priceMap: Partial<Record<PlanCode, string>> = {};

  for (const tier of TIERS) {
    if (!stripe) {
      console.log(JSON.stringify(tier, null, 2));
      continue;
    }

    const productSlug = tier.product.toLowerCase().replace(/\s+/g, "-");
    const product = await stripe.products.create(
      { name: tier.product, metadata: { phase: "phase0-pr0.2" } },
      { idempotencyKey: `phase0-product-${productSlug}` },
    );
    console.log(`[stripe-provision-phase0] product "${tier.product}" -> ${product.id}`);

    for (const leg of [
      { ...tier.monthly, interval: "month" as const },
      { ...tier.yearly, interval: "year" as const },
    ]) {
      const created = await stripe.prices.create(
        {
          product: product.id,
          currency: "gbp",
          unit_amount: Math.round(leg.amountGbp * 100),
          recurring: { interval: leg.interval },
          metadata: {
            planCode: leg.code,
            av30Included: String(tier.av30Included),
          },
        },
        { idempotencyKey: `phase0-price-${leg.code}` },
      );
      priceMap[leg.code] = created.id;
      console.log(
        `[stripe-provision-phase0]   ${leg.code} (£${leg.amountGbp}/${leg.interval}) -> ${created.id}`,
      );
    }
  }

  if (apply) {
    const envKey = live ? "STRIPE_PRICE_MAP" : "STRIPE_PRICE_MAP_TEST";
    console.log(
      `\n[stripe-provision-phase0] Add these entries to ${envKey} (merge with the existing codes already in that env var - don't replace it):`,
    );
    console.log(JSON.stringify(priceMap, null, 2));
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stripe-provision-phase0] ${message}`);
  process.exit(1);
});
