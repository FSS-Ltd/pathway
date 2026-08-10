import { PrismaClient } from "@prisma/client";
import { grantOutboxDispatchRole } from "../src/outbox-dispatch-role";

const runtimeDatabaseUrl = process.env.OUTBOX_DISPATCH_DATABASE_URL;

if (!runtimeDatabaseUrl) {
  throw new Error("OUTBOX_DISPATCH_DATABASE_URL is required");
}

const prisma = new PrismaClient();

try {
  await grantOutboxDispatchRole(prisma, runtimeDatabaseUrl);
} finally {
  await prisma.$disconnect();
}
