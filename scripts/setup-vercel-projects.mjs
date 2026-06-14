#!/usr/bin/env node
import process from "node:process";
import { getArgValue, loadEnvFile, resolveEnvFile } from "./lib/env-file.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const strict = args.has("--strict");
const selectedTarget = getArgValue("--target");
const { envFile, values: fileEnv } = loadOptionalEnvFile();
const automationEnv = { ...fileEnv, ...process.env };

const PROJECTS = {
  web: {
    idEnv: "VERCEL_WEB_PROJECT_ID",
    nameEnv: "VERCEL_WEB_PROJECT_NAME",
    defaultName: "nexsteps-web",
    config: {
      framework: "nextjs",
      rootDirectory: "apps/web",
      installCommand:
        "cd ../.. && corepack enable && pnpm install --frozen-lockfile --prod=false",
      buildCommand: "cd ../.. && pnpm --filter @pathway/web build",
      outputDirectory: ".next",
      serverlessFunctionRegion: "lhr1",
      sourceFilesOutsideRootDirectory: true,
    },
  },
  admin: {
    idEnv: "VERCEL_ADMIN_PROJECT_ID",
    nameEnv: "VERCEL_ADMIN_PROJECT_NAME",
    defaultName: "nexsteps-admin",
    config: {
      framework: "nextjs",
      rootDirectory: "apps/admin",
      installCommand:
        "cd ../.. && corepack enable && pnpm install --frozen-lockfile --prod=false",
      buildCommand: "cd ../.. && pnpm --filter @pathway/admin build",
      outputDirectory: ".next",
      serverlessFunctionRegion: "lhr1",
      sourceFilesOutsideRootDirectory: true,
    },
  },
  api: {
    idEnv: "VERCEL_API_PROJECT_ID",
    nameEnv: "VERCEL_API_PROJECT_NAME",
    defaultName: "nexsteps-api",
    config: {
      rootDirectory: "apps/api",
      installCommand:
        "cd ../.. && corepack enable && pnpm install --frozen-lockfile --prod=false",
      buildCommand: "cd ../.. && pnpm --filter @pathway/api build",
      serverlessFunctionRegion: "lhr1",
      sourceFilesOutsideRootDirectory: true,
    },
  },
};

const teamId =
  getArgValue("--team-id") ??
  automationEnv.VERCEL_TEAM_ID ??
  automationEnv.VERCEL_ORG_ID;
const token = automationEnv.VERCEL_TOKEN;

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[vercel-projects] ${message}`);
  process.exit(1);
});

async function main() {
  const targets = selectedTarget
    ? Object.entries(PROJECTS).filter(([name]) => name === selectedTarget)
    : Object.entries(PROJECTS);

  if (selectedTarget && targets.length === 0) {
    throw new Error(
      `Unknown target "${selectedTarget}". Use web, admin, or api.`,
    );
  }

  console.log(
    `[vercel-projects] mode=${modeName()} team=${teamId ?? "missing"} source=${
      envFile ?? "none"
    }`,
  );

  if (apply || strict) {
    const requiredFor = apply ? "when using --apply" : "for launch preflight";
    const errors = [];
    if (!token) errors.push(`VERCEL_TOKEN is required ${requiredFor}.`);
    if (!teamId) {
      errors.push(
        `VERCEL_TEAM_ID or VERCEL_ORG_ID is required ${requiredFor}.`,
      );
    }
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
  }

  const projectIds = {};

  for (const [target, project] of targets) {
    const name = automationEnv[project.nameEnv] ?? project.defaultName;
    const desired = { name, ...project.config };
    console.log(
      `[vercel-projects] ${target}: ${name} root=${desired.rootDirectory}`,
    );

    if (!apply) {
      console.log(JSON.stringify({ target, idEnv: project.idEnv, ...desired }));
      continue;
    }

    const existing = await getProjectByName(name);
    if (existing) {
      projectIds[project.idEnv] = existing.id;
      await updateProject(existing.id, desired);
      console.log(`[vercel-projects] ${target}: updated id=${existing.id}`);
      continue;
    }

    const created = await createProject(desired);
    projectIds[project.idEnv] = created.id;
    console.log(`[vercel-projects] ${target}: created id=${created.id}`);
  }

  if (apply) {
    console.log("[vercel-projects] GitHub/Vercel secret values to store:");
    console.log(`VERCEL_ORG_ID=${teamId}`);
    for (const [key, value] of Object.entries(projectIds)) {
      console.log(`${key}=${value}`);
    }
  }
}

function modeName() {
  if (apply) return "apply";
  return strict ? "strict" : "dry-run";
}

async function getProjectByName(name) {
  const url = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(name)}`,
  );
  url.searchParams.set("teamId", teamId);
  const response = await vercelFetch(url, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    await throwVercelError(response, `lookup failed for ${name}`);
  }
  return response.json();
}

async function createProject(project) {
  const url = new URL("https://api.vercel.com/v11/projects");
  url.searchParams.set("teamId", teamId);
  const response = await vercelFetch(url, {
    method: "POST",
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    await throwVercelError(response, `create failed for ${project.name}`);
  }
  return response.json();
}

async function updateProject(id, project) {
  const url = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("teamId", teamId);
  const { name: _name, ...settings } = project;
  const response = await vercelFetch(url, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    await throwVercelError(response, `update failed for ${project.name}`);
  }
  return response.json();
}

async function vercelFetch(url, init) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function throwVercelError(response, label) {
  const text = await response.text().catch(() => "");
  throw new Error(
    `Vercel project ${label}: ${response.status} ${text.slice(0, 500)}`,
  );
}

function loadOptionalEnvFile() {
  try {
    const found = resolveEnvFile();
    return { envFile: found, values: loadEnvFile(found) };
  } catch {
    return { envFile: undefined, values: {} };
  }
}
