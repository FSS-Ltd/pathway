import { prisma } from "@pathway/db";
import { backfillOrgVertical } from "../src/backfill-org-vertical";

backfillOrgVertical()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
