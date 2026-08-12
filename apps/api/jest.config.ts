import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  verbose: true,
  rootDir: ".",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.spec.json",
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    // Map workspace imports like @pathway/db -> ../../packages/db/src/index.ts for tests
    "^@pathway/([^/]+)$": "<rootDir>/../../packages/$1/src/index.ts",
    // Let @prisma/client resolve from node_modules; avoid manual mapping which can break typings/runtime
  },
  setupFilesAfterEnv: ["<rootDir>/test.setup.ts"],
  testMatch: [
    "**/__tests__/**/*.spec.ts",
    "**/tests/**/*.spec.ts",
    "**/*.e2e-spec.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

export default config;
