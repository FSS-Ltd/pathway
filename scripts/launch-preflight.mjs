#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const STEPS = [
  {
    label: "Permission definition registry drift",
    command: ["pnpm", "permission-definitions:check"],
  },
  {
    label: "Supabase public-table RLS readiness",
    command: [process.execPath, "scripts/check-supabase-rls.mjs", "--strict"],
  },
  {
    label: "Vercel project setup inputs",
    command: [
      process.execPath,
      "scripts/setup-vercel-projects.mjs",
      "--strict",
    ],
  },
  {
    label: "Vercel production env readiness",
    command: [process.execPath, "scripts/sync-vercel-env.mjs", "--strict"],
  },
  {
    label: "GitHub Actions secret readiness",
    command: [
      process.execPath,
      "scripts/setup-github-actions-secrets.mjs",
      "--strict",
    ],
  },
];

let failed = false;

for (const step of STEPS) {
  console.log(`\n[launch-preflight] ${step.label}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  console.error("\n[launch-preflight] Launch preflight failed.");
  process.exit(1);
}

console.log("\n[launch-preflight] Launch preflight passed.");
