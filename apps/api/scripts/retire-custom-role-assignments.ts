import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HttpException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@pathway/db";
import { z } from "zod";
import { AccessCacheService } from "../src/access-control/access-cache.service";
import { AccessControlModule } from "../src/access-control/access-control.module";
import { CutoverPreviewError } from "../src/access-control/custom-assignment-parity-error";
import { planSchema } from "../src/access-control/custom-assignment-parity-plan";
import { CustomAssignmentRetirementService } from "../src/access-control/custom-assignment-retirement.service";
import { EffectivePermissionsService } from "../src/access-control/effective-permissions.service";
import { RoleSafetyService } from "../src/access-control/role-safety.service";
import { OutboxService } from "../src/common/outbox/outbox.service";

const usage =
  "Usage: pnpm --filter @pathway/api access:retire --plan <proposed-plan.json> --actor-user-id <fixed-head-uuid>";

function argumentsFrom(argv: readonly string[]) {
  if (
    argv.length !== 4 ||
    argv[0] !== "--plan" ||
    !argv[1] ||
    argv[2] !== "--actor-user-id"
  ) {
    throw new Error(usage);
  }
  const parsed = z.string().uuid().safeParse(argv[3]);
  if (!parsed.success) throw new Error(usage);
  return { path: argv[1], actorUserId: parsed.data };
}

function writeRow(row: object): void {
  process.stdout.write(`${JSON.stringify(row)}\n`);
}

async function main(): Promise<void> {
  const { path, actorUserId } = argumentsFrom(process.argv.slice(2));
  const plan = planSchema.parse(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
  const requestId = randomUUID();
  const app = await NestFactory.createApplicationContext(AccessControlModule, {
    logger: false,
  });
  try {
    const retirement = new CustomAssignmentRetirementService(
      app.get(EffectivePermissionsService),
      app.get(RoleSafetyService),
      app.get(OutboxService),
      app.get(AccessCacheService),
    );
    writeRow({ type: "start", version: 1, orgId: plan.orgId, requestId });
    const completed = await retirement.retire(
      plan,
      {
        orgId: plan.orgId,
        userId: actorUserId,
        legacyOrgRoles: [],
        requestId,
      },
      (result) => writeRow({ type: "user-committed", ...result }),
    );
    writeRow({
      type: "complete",
      orgId: plan.orgId,
      requestId,
      userCount: completed.length,
      assignmentCount: completed.reduce(
        (total, user) => total + user.assignmentCount,
        0,
      ),
    });
  } finally {
    await app.close();
  }
}

void main()
  .catch((error: unknown) => {
    if (error instanceof CutoverPreviewError) {
      console.error(`[access-retire] ${error.message}`);
    } else if (error instanceof HttpException) {
      console.error(`[access-retire] ${JSON.stringify(error.getResponse())}`);
    } else if (error instanceof Error && error.message === usage) {
      console.error(error.message);
    } else {
      console.error(
        "[access-retire] Failed. Check the plan, actor, database connection, and the last committed user row.",
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
