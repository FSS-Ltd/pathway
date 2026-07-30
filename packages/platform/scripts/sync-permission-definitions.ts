import { closePrisma, runTransaction } from "@pathway/db";
import { syncPermissionDefinitions } from "../src/permission-definition-sync";

async function main(): Promise<void> {
  const result = await runTransaction(syncPermissionDefinitions);
  console.log(
    `[permission-definitions] synchronized: ${result.inserted} inserted, ` +
      `${result.updated} updated, ${result.deactivated} deactivated`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("[permission-definitions] synchronization failed", error);
    process.exitCode = 1;
  })
  .finally(closePrisma);
