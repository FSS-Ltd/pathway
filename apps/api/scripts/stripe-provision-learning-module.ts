/**
 * Creates the production or test Stripe product and recurring prices for the
 * Learning module. When requested, it also merges the resulting Price IDs into
 * the matching STRIPE_PRICE_MAP in the selected environment file.
 *
 * Usage:
 *   pnpm --filter @pathway/api stripe:provision:learning
 *   pnpm --filter @pathway/api stripe:provision:learning -- --apply
 *   pnpm --filter @pathway/api stripe:provision:learning -- --apply --live --update-price-map
 *
 * Live mode loads the repository's .env.prod file by default. The script is
 * deliberately dry-run by default because --apply --live creates live Stripe
 * Prices that cannot be changed after creation.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

type LearningPriceSpec = {
  code: "MODULE_LEARNING_MONTHLY" | "MODULE_LEARNING_YEARLY";
  amountPence: number;
  interval: "month" | "year";
};

const PRODUCT_NAME = "Nexsteps Learning module";
const PRODUCT_METADATA = {
  pathway_module: "LEARNING",
  pathway_product_type: "module_addon",
};
const PRICE_SPECS: readonly LearningPriceSpec[] = [
  { code: "MODULE_LEARNING_MONTHLY", amountPence: 2900, interval: "month" },
  { code: "MODULE_LEARNING_YEARLY", amountPence: 29000, interval: "year" },
];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const live = args.has("--live");
const updatePriceMap = args.has("--update-price-map");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const explicitEnvFile = getArgumentValue("--env-file");

async function main(): Promise<void> {
  if (updatePriceMap && !apply) {
    throw new Error("--update-price-map requires --apply.");
  }

  const mode = !apply ? "dry-run" : live ? "apply (LIVE)" : "apply (test)";
  console.log(`[stripe-provision-learning] mode=${mode}`);

  if (!apply) {
    for (const spec of PRICE_SPECS) {
      console.log(
        `[stripe-provision-learning] ${spec.code}: GBP ${(spec.amountPence / 100).toFixed(2)} / ${spec.interval}`,
      );
    }
    console.log(
      "Pass --apply to create test-mode prices, or --apply --live --update-price-map to provision production and update .env.prod. No API calls made.",
    );
    return;
  }

  const envFile = loadEnvironmentFile();
  const secretKey = live
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST;
  if (!secretKey) {
    throw new Error(
      live
        ? "STRIPE_SECRET_KEY is required for --apply --live."
        : "STRIPE_SECRET_KEY_TEST is required for --apply.",
    );
  }

  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });
  const product = await findOrCreateProduct(stripe);
  const priceMap: Record<LearningPriceSpec["code"], string> = {
    MODULE_LEARNING_MONTHLY: "",
    MODULE_LEARNING_YEARLY: "",
  };

  for (const spec of PRICE_SPECS) {
    const price = await findOrCreatePrice(stripe, product, spec);
    priceMap[spec.code] = price.id;
    console.log(`[stripe-provision-learning] ${spec.code} ready`);
  }

  const envKey = live ? "STRIPE_PRICE_MAP" : "STRIPE_PRICE_MAP_TEST";
  if (updatePriceMap) {
    mergePriceMapIntoEnvFile(envFile, envKey, priceMap);
    console.log(
      `[stripe-provision-learning] Updated ${path.relative(repositoryRoot, envFile)} (${envKey}).`,
    );
  } else {
    console.log(
      `[stripe-provision-learning] Merge ${PRICE_SPECS.map((spec) => spec.code).join(", ")} into ${envKey} before enabling checkout.`,
    );
  }
}

function getArgumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const values = process.argv.slice(2);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    if (value === name) {
      const next = values[index + 1];
      return next && !next.startsWith("--") ? next : undefined;
    }
  }
  return undefined;
}

function loadEnvironmentFile(): string {
  const defaultFile = live
    ? path.join(repositoryRoot, ".env.prod")
    : path.join(repositoryRoot, ".env");
  const envFile = path.resolve(repositoryRoot, explicitEnvFile ?? defaultFile);
  if (!fs.existsSync(envFile)) {
    throw new Error(`Environment file not found: ${path.relative(repositoryRoot, envFile)}`);
  }
  const result = config({ path: envFile, override: true });
  if (result.error) {
    throw new Error(`Unable to load ${path.relative(repositoryRoot, envFile)}.`);
  }
  return envFile;
}

async function findOrCreateProduct(stripe: Stripe): Promise<Stripe.Product> {
  let startingAfter: string | undefined;
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      starting_after: startingAfter,
    });
    for (const product of page.data) {
      if (
        product.metadata.pathway_module === PRODUCT_METADATA.pathway_module ||
        product.name === PRODUCT_NAME
      ) {
        return product;
      }
    }
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return stripe.products.create(
    {
      name: PRODUCT_NAME,
      description: "Learning module add-on for eligible non-home-education organisations.",
      metadata: PRODUCT_METADATA,
    },
    { idempotencyKey: "pathway-learning-module-product-v1" },
  );
}

async function findOrCreatePrice(
  stripe: Stripe,
  product: Stripe.Product,
  spec: LearningPriceSpec,
): Promise<Stripe.Price> {
  let startingAfter: string | undefined;
  do {
    const page = await stripe.prices.list({
      product: product.id,
      active: true,
      type: "recurring",
      limit: 100,
      starting_after: startingAfter,
    });
    for (const price of page.data) {
      if (
        price.metadata.price_code === spec.code ||
        (price.currency === "gbp" &&
          price.unit_amount === spec.amountPence &&
          price.recurring?.interval === spec.interval)
      ) {
        return price;
      }
    }
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return stripe.prices.create(
    {
      product: product.id,
      currency: "gbp",
      unit_amount: spec.amountPence,
      recurring: { interval: spec.interval },
      metadata: {
        price_code: spec.code,
        pathway_module: "LEARNING",
      },
    },
    { idempotencyKey: `pathway-learning-module-${spec.code.toLowerCase()}-v1` },
  );
}

function mergePriceMapIntoEnvFile(
  envFile: string,
  envKey: "STRIPE_PRICE_MAP" | "STRIPE_PRICE_MAP_TEST",
  additions: Record<LearningPriceSpec["code"], string>,
): void {
  const contents = fs.readFileSync(envFile, "utf8");
  const parsed = config({ path: envFile, override: false }).parsed ?? {};
  const existingValue = parsed[envKey] ?? "{}";
  const existingMap = parsePriceMap(existingValue, envKey, envFile);

  const nextValue = JSON.stringify({ ...existingMap, ...additions });
  const line = `${envKey}='${nextValue}'`;
  const pattern = new RegExp(`^(?:export\\s+)?${envKey}=.*$`, "m");
  const updated = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents}${contents.endsWith("\n") ? "" : "\n"}${line}\n`;

  fs.writeFileSync(envFile, updated, { mode: 0o600 });
}

function parsePriceMap(
  value: string,
  envKey: string,
  envFile: string,
): Record<string, string> {
  for (const candidate of [value, value.replace(/\\"/g, '"')]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      // Try the escaped JSON form often found in an .env file.
    }
  }
  throw new Error(`${envKey} in ${path.relative(repositoryRoot, envFile)} is not valid JSON.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stripe-provision-learning] ${message}`);
  process.exit(1);
});
