import { GuestPassCleanupService } from "./guest-pass-cleanup.service";

async function main() {
  const svc = new GuestPassCleanupService();
  await svc.run();
  console.log("Guest pass cleanup run complete");
}

main().catch((err) => {
  console.error("Guest pass cleanup run failed", err);
  process.exit(1);
});
