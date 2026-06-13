#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { isPresent, loadEnvFile, resolveEnvFile } from "./lib/env-file.mjs";

const command = process.argv[2];
const COMMANDS = {
  status: [
    "--filter",
    "@pathway/db",
    "exec",
    "prisma",
    "migrate",
    "status",
    "--schema",
    "prisma/schema.prisma",
  ],
  deploy: ["--filter", "@pathway/db", "run", "prisma:migrate:deploy"],
};

if (!command || !(command in COMMANDS)) {
  console.error(
    "[prisma-production] Usage: node scripts/prisma-production.mjs <status|deploy>",
  );
  process.exit(1);
}

const envFile = resolveEnvFile();
const fileEnv = loadEnvFile(envFile);
const databaseUrl = fileEnv.DIRECT_URL ?? fileEnv.DATABASE_URL;

if (!isPresent(databaseUrl)) {
  console.error(
    "[prisma-production] DIRECT_URL or DATABASE_URL is required in the production env file.",
  );
  process.exit(1);
}

console.log(
  `[prisma-production] source=${path.relative(
    process.cwd(),
    envFile,
  )} command=${command}`,
);

const child = spawn("pnpm", COMMANDS[command], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...fileEnv,
    DATABASE_URL: databaseUrl,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[prisma-production] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
