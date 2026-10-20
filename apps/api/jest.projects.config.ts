// jest.projects.config.ts
import base from "./jest.config";

// Allowlist only the safe, non-test-discovery options from base
function pick<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[],
): Partial<T> {
  return keys.reduce((acc, k) => {
    if (obj && obj[k] !== undefined) (acc as Partial<T>)[k] = obj[k];
    return acc;
  }, {} as Partial<T>);
}

const baseSafe = pick(base as Record<string, unknown>, [
  "preset",
  "transform",
  "moduleNameMapper",
  "moduleFileExtensions",
  "testEnvironment",
  "roots",
  "globals",
  "setupFiles",
  "collectCoverage",
  "collectCoverageFrom",
  "coveragePathIgnorePatterns",
  "coverageProvider",
  "coverageReporters",
  "reporters",
  "resolver",
  "extensionsToTreatAsEsm",
  "testEnvironmentOptions",
  "fakeTimers",
  "runner",
]);

// UNIT: use only testRegex, never testMatch
const unit = {
  ...baseSafe,
  displayName: "unit",
  testRegex: "^(?!.*\\.e2e(\\.|-)spec\\.ts$).*\\.spec\\.ts$",
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "\\.e2e(\\.|-)spec\\.ts$",
  ],
  setupFilesAfterEnv: ["<rootDir>/test.setup.unit.ts"],
};

// E2E: use only testMatch, never testRegex
const e2e = {
  ...baseSafe,
  displayName: "e2e",
  globalSetup: "<rootDir>/test.global-setup.e2e.ts",
  testMatch: ["**/*.e2e-spec.ts", "**/*.e2e.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  setupFilesAfterEnv: ["<rootDir>/test.setup.e2e.ts"],
  maxWorkers: 1,
};

export default { projects: [unit, e2e] };
