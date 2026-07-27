import { closePrisma, runReadOnlyTransaction } from "@pathway/db";
import { assertPermissionDefinitionsInSync } from "../src/permission-definition-sync";

async function main(): Promise<void> {
  await runReadOnlyTransaction(assertPermissionDefinitionsInSync);
  console.log("[permission-definitions] registry drift: zero");
}

main()
  .catch((error: unknown) => {
    console.error(
      "[permission-definitions] registry drift check failed",
      error,
    );
    process.exitCode = 1;
  })
  .finally(closePrisma);
