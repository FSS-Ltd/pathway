import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
import process from "node:process";
import { URL } from "node:url";

const fetch = globalThis.fetch;

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = resolve(apiRoot, "api/[...path].js");
const bundleDirectory = resolve(apiRoot, "dist/serverless");
const dependenciesPath = resolve(apiRoot, "node_modules");
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must point to a disposable local database",
  );
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3000";

const stagedRoot = await mkdtemp(join(tmpdir(), "pathway-api-bundle-"));
const stagedApi = join(stagedRoot, "api");
const stagedBundleDirectory = join(stagedRoot, "dist/serverless");
await mkdir(stagedApi, { recursive: true });
await mkdir(stagedBundleDirectory, { recursive: true });
await cp(entryPath, join(stagedApi, "[...path].js"));
await cp(bundleDirectory, stagedBundleDirectory, { recursive: true });
await symlink(dependenciesPath, join(stagedRoot, "node_modules"), "dir");
await writeFile(join(stagedRoot, "package.json"), '{"type":"module"}');

try {
  assert.equal(
    await exists(join(stagedRoot, "src")),
    false,
    "the staged function must not contain API source files",
  );
  const bundleSource = await readFile(
    join(stagedBundleDirectory, "index.mjs"),
    "utf8",
  );
  assert.doesNotMatch(bundleSource, /tsx\/cjs|tsx\/esm/);

  const bundle = await import(
    new URL(`file://${join(stagedBundleDirectory, "index.mjs")}`)
  );
  assert.equal(typeof bundle.createServerlessHandler, "function");
  const runtimeRequire = createRequire(
    join(stagedBundleDirectory, "index.mjs"),
  );
  assert.equal(
    runtimeRequire.extensions[".ts"],
    undefined,
    "the artifact must not install a runtime TypeScript loader",
  );

  let factoryCalls = 0;
  const observedUrls = [];
  const concurrentHandler = bundle.createServerlessHandler(async () => {
    factoryCalls += 1;
    await setTimeout(10);
    return (request) => observedUrls.push(request.url);
  });
  await Promise.all([
    concurrentHandler({ url: "/api/health?__vercel_path=health%2Fenv" }, {}),
    concurrentHandler({ url: "/health/env" }, {}),
  ]);
  assert.equal(factoryCalls, 1, "concurrent cold starts must share bootstrap");
  assert.deepEqual(observedUrls, ["/health/env", "/health/env"]);

  const { default: handler } = await import(
    pathToFileURL(join(stagedApi, "[...path].js"))
  );
  const server = createServer(handler);
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const [firstHealth, secondHealth] = await Promise.all([
      fetch(`${baseUrl}/health/env`),
      fetch(`${baseUrl}/?__vercel_path=health%2Fenv`),
    ]);
    assert.equal(firstHealth.status, 200);
    assert.equal(secondHealth.status, 200);
    const preflight = await fetch(`${baseUrl}/auth/me`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.ok(preflight.status >= 200 && preflight.status < 300);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );

    const unauthorized = await fetch(`${baseUrl}/auth/me`);
    assert.equal(unauthorized.status, 401);

    const databaseHealth = await fetch(`${baseUrl}/health`);
    assert.equal(databaseHealth.status, 200);
    const databaseHealthBody = await databaseHealth.json();
    assert.equal(databaseHealthBody.status, "ok");
    assert.equal(typeof databaseHealthBody.dbTime, "string");
  } finally {
    await new Promise((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
  }
} finally {
  await rm(stagedRoot, { recursive: true, force: true });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
