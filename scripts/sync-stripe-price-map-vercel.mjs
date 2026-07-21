#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import {
  getArgValue,
  isPresent,
  loadEnvFile,
  resolveEnvFile,
} from "./lib/env-file.mjs";

const apply = process.argv.slice(2).includes("--apply");
const envFile = resolveEnvFile({
  explicit: getArgValue("--env-file"),
  candidates: [".env.prod", "env.production", ".env.production"],
});
const env = { ...process.env, ...loadEnvFile(envFile) };

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[stripe-price-map-sync] ${message}`);
  process.exit(1);
});

async function main() {
  const priceMap = parsePriceMap(env.STRIPE_PRICE_MAP);
  const requiredCodes = ["MODULE_LEARNING_MONTHLY", "MODULE_LEARNING_YEARLY"];
  const missingCodes = requiredCodes.filter((code) => !isPresent(priceMap[code]));
  if (missingCodes.length > 0) {
    throw new Error(`STRIPE_PRICE_MAP is missing: ${missingCodes.join(", ")}.`);
  }

  const missingConfig = [
    ["VERCEL_TOKEN", env.VERCEL_TOKEN],
    ["VERCEL_API_PROJECT_ID", env.VERCEL_API_PROJECT_ID],
  ].filter(([, value]) => !isPresent(value));
  if (missingConfig.length > 0) {
    throw new Error(
      `Missing deployment configuration: ${missingConfig.map(([key]) => key).join(", ")}.`,
    );
  }

  const mode = apply ? "apply" : "dry-run";
  console.log(
    `[stripe-price-map-sync] source=${path.relative(process.cwd(), envFile)} mode=${mode} codes=${requiredCodes.join(",")}`,
  );
  if (!apply) {
    console.log("Pass --apply to upsert only STRIPE_PRICE_MAP for the Vercel API production environment.");
    return;
  }

  const url = new URL(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(env.VERCEL_API_PROJECT_ID)}/env`,
  );
  url.searchParams.set("upsert", "true");
  const teamId = env.VERCEL_TEAM_ID ?? env.VERCEL_ORG_ID;
  if (teamId?.startsWith("team_")) url.searchParams.set("teamId", teamId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        key: "STRIPE_PRICE_MAP",
        value: JSON.stringify(priceMap),
        type: "encrypted",
        target: ["production"],
        comment: `Synced Learning module price codes from ${path.basename(envFile)}`,
      },
    ]),
  });

  if (!response.ok) {
    throw new Error(`Vercel API price-map sync failed with status ${response.status}.`);
  }
  const result = await response.json().catch(() => ({}));
  if (Array.isArray(result.failed) && result.failed.length > 0) {
    throw new Error("Vercel API price-map sync reported a failed update.");
  }
  console.log("[stripe-price-map-sync] Updated STRIPE_PRICE_MAP for the Vercel API production environment.");
}

function parsePriceMap(value) {
  if (!isPresent(value)) {
    throw new Error("STRIPE_PRICE_MAP is required.");
  }
  const candidates = [value, value.replace(/\\"/g, '"')];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the escaped JSON form commonly used in .env files.
    }
  }
  throw new Error("STRIPE_PRICE_MAP must be valid JSON.");
}
