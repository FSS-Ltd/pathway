import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "tsx", "js"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/__tests__/**"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.spec.ts"],
};

export default config;
