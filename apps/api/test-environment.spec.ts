import { selectE2eDatabaseUrl } from "./test-environment.e2e";

describe("selectE2eDatabaseUrl", () => {
  it("preserves an explicit E2E database URL when the env file defines a test database URL", () => {
    const explicitUrl =
      "postgresql://ci_user:ci_password@localhost:5432/pathway_ci?schema=app";
    const envFileUrl =
      "postgresql://local_user:local_password@localhost:5433/pathway_local?schema=app";

    expect(
      selectE2eDatabaseUrl(
        { E2E_DATABASE_URL: explicitUrl },
        { TEST_DATABASE_URL: envFileUrl, E2E_DATABASE_URL: envFileUrl },
      ),
    ).toBe(explicitUrl);
  });

  it("uses the E2E database URL after global setup loads local test defaults", () => {
    const ciUrl =
      "postgresql://ci_user:ci_password@localhost:5432/pathway_ci?schema=app";
    const localUrl =
      "postgresql://local_user:local_password@localhost:5433/pathway_local?schema=app";

    expect(
      selectE2eDatabaseUrl(
        { TEST_DATABASE_URL: localUrl, E2E_DATABASE_URL: ciUrl },
        { TEST_DATABASE_URL: localUrl, E2E_DATABASE_URL: ciUrl },
        true,
      ),
    ).toBe(ciUrl);
  });
});
