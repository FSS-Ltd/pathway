import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VercelFunctionConfig {
  includeFiles: string;
}

interface VercelConfig {
  functions: Record<string, VercelFunctionConfig>;
}

const VERCEL_INCLUDE_FILES_MAX_LENGTH = 256;

describe("Vercel API bundle", () => {
  it("serves a request through the production entry", () => {
    const script = `
      const request = require('supertest');
      const handler = require('./api/[...path].js');
      request(handler).get('/health/env')
        .then((response) => {
          if (response.status !== 200) {
            throw new Error('Expected health/env to return 200, got ' + response.status);
          }
        })
        .catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).toBe(0);
  }, 20_000);

  it("includes all API workspace packages at runtime", () => {
    const config: VercelConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    );
    const includeFiles = config.functions["api/[...path].js"]?.includeFiles;

    expect(includeFiles).toContain(
      "../../packages/{ace-domain,auth,db,platform,pricing,types,util}/{src/**,package.json}",
    );
    expect(includeFiles.length).toBeLessThanOrEqual(
      VERCEL_INCLUDE_FILES_MAX_LENGTH,
    );
  });
});
