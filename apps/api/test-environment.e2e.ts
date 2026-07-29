export function selectE2eDatabaseUrl(
  explicitEnvironment: NodeJS.ProcessEnv,
  loadedEnvironment: NodeJS.ProcessEnv,
  usesGlobalSetup = false,
): string | undefined {
  if (usesGlobalSetup) {
    return (
      explicitEnvironment.E2E_DATABASE_URL ?? loadedEnvironment.E2E_DATABASE_URL
    );
  }

  return (
    explicitEnvironment.TEST_DATABASE_URL ??
    explicitEnvironment.E2E_DATABASE_URL ??
    loadedEnvironment.TEST_DATABASE_URL ??
    loadedEnvironment.E2E_DATABASE_URL
  );
}
