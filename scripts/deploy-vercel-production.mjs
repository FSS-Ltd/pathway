#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  getArgValue,
  isPresent,
  loadEnvFile,
  resolveEnvFile,
} from "./lib/env-file.mjs";

const VERCEL_CLI_VERSION = "54.13.0";
const args = new Set(process.argv.slice(2).filter((item) => item !== "--"));
const selectedTarget = getArgValue("--target");
const skipBuild = args.has("--skip-build");
const remoteBuild = args.has("--remote-build");
const envFile = resolveEnvFile();
const sourceEnv = loadEnvFile(envFile);
const env = { ...sourceEnv, ...process.env };

const PROJECTS = {
  web: {
    cwd: "apps/web",
    projectIdEnv: "VERCEL_WEB_PROJECT_ID",
  },
  admin: {
    cwd: "apps/admin",
    projectIdEnv: "VERCEL_ADMIN_PROJECT_ID",
  },
  api: {
    cwd: "apps/api",
    projectIdEnv: "VERCEL_API_PROJECT_ID",
  },
};

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[vercel-deploy] ${message}`);
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
  if (!isPresent(env.VERCEL_TOKEN)) {
    throw new Error("VERCEL_TOKEN is required.");
  }

  console.log(
    `[vercel-deploy] source=${path.relative(process.cwd(), envFile)} targets=${targets
      .map(([name]) => name)
      .join(",")}`,
  );

  for (const [name, project] of targets) {
    const projectId = env[project.projectIdEnv];
    if (!isPresent(projectId)) {
      throw new Error(`${project.projectIdEnv} is required for ${name}.`);
    }

    console.log(`[vercel-deploy] ${name}: pull production env`);
    runVercel(
      [
        "pull",
        "--cwd",
        project.cwd,
        "--yes",
        "--environment=production",
        "--project",
        projectId,
      ],
    );

    if (!skipBuild && !remoteBuild) {
      skipVercelLocalInstall(project.cwd);
      console.log(`[vercel-deploy] ${name}: build production artifact`);
      runVercel([
        "build",
        "--cwd",
        project.cwd,
        "--prod",
        "--project",
        projectId,
      ]);
    }

    if (remoteBuild) {
      console.log(`[vercel-deploy] ${name}: deploy with remote build`);
      runVercel(["deploy", "--prod", "--archive=tgz", "--project", projectId]);
    } else {
      console.log(`[vercel-deploy] ${name}: deploy prebuilt artifact`);
      runVercel([
        "deploy",
        "--cwd",
        project.cwd,
        "--prebuilt",
        "--prod",
        "--project",
        projectId,
      ]);
    }
  }
}

function skipVercelLocalInstall(projectCwd) {
  const settingsPath = path.join(projectCwd, ".vercel", "project.json");
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Vercel project settings not found at ${settingsPath}.`);
  }

  const project = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  project.settings = project.settings || {};
  project.settings.installCommand = "";
  fs.writeFileSync(settingsPath, `${JSON.stringify(project, null, 2)}\n`);
}

function runVercel(vercelArgs) {
  const systemPath = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  const result = spawnSync(
    "npx",
    [
      "--yes",
      `vercel@${VERCEL_CLI_VERSION}`,
      ...vercelArgs,
      "--token",
      env.VERCEL_TOKEN,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: process.env.PATH
          ? `${systemPath}:${process.env.PATH}`
          : systemPath,
        SHELL: process.env.SHELL || "/bin/sh",
        VERCEL_CLI_SYSTEM_PATH: systemPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    throw new Error(
      `vercel ${vercelArgs[0]} failed with exit code ${result.status}.`,
    );
  }
}
