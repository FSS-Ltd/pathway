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
