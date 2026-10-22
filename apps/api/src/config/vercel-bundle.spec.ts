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
  it("includes only the compiled handler and required Prisma runtime files", () => {
    const config: VercelConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    );
    const includeFiles = config.functions["api/[...path].js"]?.includeFiles;

    expect(includeFiles).toContain("dist/serverless/**");
    expect(includeFiles).not.toContain("node_modules/@prisma/client/");
    expect(includeFiles).toContain("../../packages/db/prisma/schema.prisma");
    expect(includeFiles).toContain(".prisma/client/**");
    expect(includeFiles).not.toContain("src/**");
    expect(includeFiles).not.toContain("scripts/**");
    expect(includeFiles).not.toContain("tests/**");
    expect(includeFiles.length).toBeLessThanOrEqual(
      VERCEL_INCLUDE_FILES_MAX_LENGTH,
    );
  });
});
