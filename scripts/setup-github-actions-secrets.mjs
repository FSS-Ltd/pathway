#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  getArgValue,
  isPresent,
  loadEnvFile,
  resolveEnvFile,
} from "./lib/env-file.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const strict = args.has("--strict");
const scope = getArgValue("--scope") ?? "environment";
const environment = getArgValue("--environment") ?? "production";
const repo = getArgValue("--repo") ?? resolveGitHubRepo();
const envFile = resolveEnvFile();
const fileEnv = loadEnvFile(envFile);
const values = withDerivedValues({ ...fileEnv, ...process.env });

const REQUIRED_SECRET_NAMES = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_WEB_PROJECT_ID",
  "VERCEL_ADMIN_PROJECT_ID",
  "VERCEL_API_PROJECT_ID",
  "DATABASE_URL",
  "DIRECT_URL",
  "RETENTION_ENABLED",
  "OUTBOX_DISPATCH_URL",
  "BEHAVIOUR_OUTBOX_DISPATCH_URL",
  "BEHAVIOUR_OUTBOX_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_STORAGE_PRIVATE_BUCKET",
];
const OPTIONAL_SECRET_NAMES = [
  "AV30_TENANT_IDS",
  "REPORT_BUNDLE_TENANT_IDS",
  "OUTBOX_DISPATCH_TOKEN",
];
const SECRET_NAMES = [...REQUIRED_SECRET_NAMES, ...OPTIONAL_SECRET_NAMES];

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[github-secrets] ${message}`);
  process.exit(1);
});

async function main() {
  if (scope !== "environment" && scope !== "repo") {
    throw new Error('Unknown --scope value. Use "environment" or "repo".');
  }

  console.log(
    `[github-secrets] source=${path.relative(process.cwd(), envFile)} mode=${modeName()} scope=${scope}${
      scope === "environment" ? `:${environment}` : ""
    }`,
  );
  console.log(`[github-secrets] repo=${repo ?? "missing"}`);

  const available = SECRET_NAMES.filter((name) => isPresent(values[name]));
  const missingRequired = REQUIRED_SECRET_NAMES.filter(
    (name) => !isPresent(values[name]),
  );
  const missingOptional = OPTIONAL_SECRET_NAMES.filter(
    (name) => !isPresent(values[name]),
  );
  console.log(
    `[github-secrets] ${available.length} ready; ${
      missingRequired.length
    } required missing${
      missingRequired.length ? ` (${missingRequired.join(", ")})` : ""
    }; ${missingOptional.length} optional missing${
      missingOptional.length ? ` (${missingOptional.join(", ")})` : ""
    }`,
  );

  if (!apply) {
    for (const name of available) {
      console.log(`[github-secrets] would set ${name}`);
    }
    if (strict) validateStrictReadiness(repo, missingRequired);
    return;
  }

  if (!repo) {
    throw new Error("GitHub repo is required. Pass --repo=owner/name.");
  }
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required GitHub Actions secrets: ${missingRequired.join(", ")}`,
    );
  }

  if (scope === "environment") {
    ensureEnvironmentExists(repo, environment);
  }

  for (const name of SECRET_NAMES) {
    if (!isPresent(values[name])) continue;
    const commandArgs =
      scope === "environment"
        ? ["secret", "set", name, "--repo", repo, "--env", environment]
        : ["secret", "set", name, "--repo", repo];
    const result = spawnSync("gh", commandArgs, {
      input: values[name],
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(
        `gh secret set failed for ${name}: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    console.log(`[github-secrets] set ${name}`);
  }
}

function modeName() {
  if (apply) return "apply";
  return strict ? "strict" : "dry-run";
}

function validateStrictReadiness(targetRepo, missing) {
  const errors = [];
  if (!targetRepo) {
    errors.push("GitHub repo is required. Pass --repo=owner/name.");
  }
  if (missing.length > 0) {
    errors.push(
      `Missing required GitHub Actions secrets: ${missing.join(", ")}`,
    );
  }
  const auth = spawnSync("gh", ["auth", "status"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (auth.status !== 0) {
    errors.push(
      `gh auth status failed: ${auth.stderr.trim() || auth.stdout.trim()}`,
    );
  }
  if (errors.length > 0) {
    throw new Error(
      `GitHub Actions secrets are not launch-ready:\n- ${errors.join("\n- ")}`,
    );
  }
}

function ensureEnvironmentExists(repo, environmentName) {
  const result = spawnSync(
    "gh",
    ["api", "--method", "PUT", `repos/${repo}/environments/${environmentName}`],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh api failed to ensure ${environmentName} environment exists: ${
        result.stderr.trim() || result.stdout.trim()
      }`,
    );
  }
  console.log(`[github-secrets] ensured environment ${environmentName}`);
}

function withDerivedValues(input) {
  const next = { ...input };
  if (!isPresent(next.VERCEL_ORG_ID) && isPresent(next.VERCEL_TEAM_ID)) {
    next.VERCEL_ORG_ID = next.VERCEL_TEAM_ID;
  }
  const apiUrl = next.API_INTERNAL_URL ?? next.NEXT_PUBLIC_API_URL;
  if (isPresent(apiUrl)) {
    next.BEHAVIOUR_OUTBOX_DISPATCH_URL ??= new URL(
      "/internal/outbox/behaviour",
      apiUrl,
    ).toString();
  }
  return next;
}

function resolveGitHubRepo() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return undefined;
  return parseGitHubRemote(result.stdout.trim());
}

function parseGitHubRemote(remote) {
  const sshMatch = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = remote.match(
    /^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/,
  );
  return httpsMatch?.[1];
}
