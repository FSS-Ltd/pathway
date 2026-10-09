import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@pathway/db";
import type { BehaviourActor } from "./behaviour-command.service";

export async function requireActiveBehaviourActor(
  actor: BehaviourActor,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { isActive: true },
  });
  if (!user?.isActive) {
    throw new ForbiddenException("An active staff account is required");
  }
}
