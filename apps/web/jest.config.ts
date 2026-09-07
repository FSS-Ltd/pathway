import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: ["**/__tests__/**/*.spec.ts", "**/__tests__/**/*.spec.tsx"],
  modulePathIgnorePatterns: ["<rootDir>/.next"],
  transformIgnorePatterns: ["node_modules/(?!(@react-pdf)/)"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
};

export default config;
