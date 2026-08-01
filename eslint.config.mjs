import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Node + Jest globals for workers (CLI scripts and tests)
const nodeGlobals = {
  process: "readable",
  console: "readable",
  __dirname: "readable",
  __filename: "readable",
  module: "readable",
  require: "readable",
  Buffer: "readable",
  global: "readable",
};
const jestGlobals = {
  describe: "readonly",
  it: "readonly",
  test: "readonly",
  expect: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  jest: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/coverage/**",
      "apps/*/src/**/*.js",
      "packages/*/src/**/*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // add repo-wide rules here later
    },
  },
  // Server-side packages and launch scripts run in Node.
  {
    files: [
      "apps/api/**/*.{ts,tsx,js,cjs}",
      "apps/workers/**/*.{ts,tsx,js,cjs}",
      "packages/db/**/*.{ts,tsx,js,cjs}",
      "scripts/**/*.{js,mjs,cjs,ts}",
      "apps/nexsteps-home/fidelity/**/*.{js,mjs,cjs,ts}",
    ],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ["**/*.cjs", "apps/api/api/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Workers: Jest globals so describe/expect etc. are defined in worker tests.
  {
    files: ["apps/workers/**/*.{ts,tsx,js}"],
    languageOptions: {
      globals: jestGlobals,
    },
  },
);
