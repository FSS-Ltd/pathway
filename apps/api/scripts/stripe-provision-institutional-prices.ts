/**
 * Idempotently provision or validate the five enrolled-child monthly components.
 * This script only accepts a Stripe test-mode key and never edits environment files.
 *
 *   tsx scripts/stripe-provision-institutional-prices.ts             # preview, no API calls
 *   STRIPE_SECRET_KEY_TEST=... tsx scripts/stripe-provision-institutional-prices.ts --validate
 *   STRIPE_SECRET_KEY_TEST=... tsx scripts/stripe-provision-institutional-prices.ts --apply
 */
import Stripe from "stripe";
import {
  INSTITUTIONAL_STRIPE_PRICE_SPECS,
  validateInstitutionalStripePrice,
  type InstitutionalStripePriceSpec,
} from "../src/billing/institutional/institutional-stripe-prices";

const CATALOGUE_VERSION = "ENROLLED_CHILDREN_V1";
const API_VERSION = "2023-10-16";
const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (
    args.some((arg) => !["--apply", "--validate"].includes(arg)) ||
    args.length > 1
  ) {
    throw new Error(
      "Use no arguments, --validate, or --apply. Live mode is unavailable.",
    );
  }
  const mode = args[0] ?? "preview";
  if (mode === "preview") {
    for (const spec of INSTITUTIONAL_STRIPE_PRICE_SPECS) {
      console.log(
        `${spec.code}: GBP ${(spec.unitAmountPence / 100).toFixed(2)} / month`,
      );
    }
    console.log("Preview only; no Stripe API calls or environment changes.");
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY_TEST;
  if (!key || !/^(?:rk|sk)_test_/.test(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY_TEST must be a test-mode restricted or secret key.",
    );
  }
  const stripe = new Stripe(key, { apiVersion: API_VERSION });
  const priceMap: Record<string, string> = {};

  for (const spec of INSTITUTIONAL_STRIPE_PRICE_SPECS) {
    const product = await findProduct(stripe, spec, mode === "--apply");
    const price = await findPrice(stripe, product, spec, mode === "--apply");
    priceMap[spec.code] = price.id;
    console.log(`${spec.code}: ${price.id}`);
  }
  console.log(`Merge into STRIPE_PRICE_MAP_TEST: ${JSON.stringify(priceMap)}`);
}

async function findProduct(
  stripe: Stripe,
  spec: InstitutionalStripePriceSpec,
  create: boolean,
): Promise<Stripe.Product> {
  const matches: Stripe.Product[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });
    matches.push(
      ...page.data.filter(
        (product) => product.metadata.pathway_price_code === spec.code,
      ),
    );
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  if (matches.length > 1)
    throw new Error(`DUPLICATE_INSTITUTIONAL_PRODUCT:${spec.code}`);
  const existing = matches[0];
  if (existing) {
    if (
      existing.livemode ||
      existing.name !== spec.productName ||
      existing.metadata.pricing_version !== CATALOGUE_VERSION
    ) {
      throw new Error(`INVALID_INSTITUTIONAL_PRODUCT:${spec.code}`);
    }
    return existing;
  }
  if (!create) throw new Error(`MISSING_INSTITUTIONAL_PRODUCT:${spec.code}`);
  const product = await stripe.products.create(
    {
      name: spec.productName,
      metadata: {
        pathway_price_code: spec.code,
        pricing_version: CATALOGUE_VERSION,
      },
    },
    { idempotencyKey: `pathway-${CATALOGUE_VERSION}-${spec.code}-product` },
  );
  if (product.livemode)
    throw new Error(`LIVE_INSTITUTIONAL_PRODUCT:${spec.code}`);
  return product;
}

async function findPrice(
  stripe: Stripe,
  product: Stripe.Product,
  spec: InstitutionalStripePriceSpec,
  create: boolean,
): Promise<Stripe.Price> {
  const matches: Stripe.Price[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });
    matches.push(
      ...page.data.filter((price) => price.metadata.price_code === spec.code),
    );
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  if (matches.length > 1)
    throw new Error(`DUPLICATE_INSTITUTIONAL_PRICE:${spec.code}`);
  let price = matches[0];
  if (price && price.metadata.pricing_version !== CATALOGUE_VERSION) {
    throw new Error(`INVALID_INSTITUTIONAL_PRICE:${spec.code}`);
  }
  if (!price) {
    if (!create) throw new Error(`MISSING_INSTITUTIONAL_PRICE:${spec.code}`);
    price = await stripe.prices.create(
      {
        product: product.id,
        currency: "gbp",
        unit_amount: spec.unitAmountPence,
        recurring: {
          interval: "month",
          interval_count: 1,
          usage_type: "licensed",
        },
        metadata: { price_code: spec.code, pricing_version: CATALOGUE_VERSION },
      },
      { idempotencyKey: `pathway-${CATALOGUE_VERSION}-${spec.code}-price` },
    );
  }
  validateInstitutionalStripePrice(price, product.id, spec);
  return price;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
