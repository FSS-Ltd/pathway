import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import { requireCurrentStaff, type MessagingActor } from "./messaging-access";
import { parentResponderWhere } from "./parent-message-responder";

export async function requireStaffSchoolTeamAccess(
  tx: Prisma.TransactionClient,
  actor: MessagingActor,
  now: Date,
): Promise<void> {
  await requireCurrentStaff(tx, actor);
  const [site, responder] = await Promise.all([
    tx.tenant.findFirst({
      where: {
        id: actor.tenantId,
        orgId: actor.orgId,
        org: { parentPortalEnabled: true },
      },
      select: { id: true },
    }),
    tx.siteMembership.findFirst({
      where: parentResponderWhere(
        actor.orgId,
        actor.tenantId,
        now,
        actor.userId,
      ),
      select: { id: true },
    }),
  ]);
  if (!site || !responder) {
    throw new NotFoundException("Conversations not found");
  }
}

export function staffSchoolTeamConversationScope(
  actor: MessagingActor,
  now: Date,
): Prisma.MessageConversationWhereInput {
  return {
    tenantId: actor.tenantId,
    kind: "PARENT_STAFF",
    guardianIdentity: {
      is: {
        tenantId: actor.tenantId,
        user: {
          isActive: true,
          studentIdentities: { none: { tenantId: actor.tenantId } },
        },
        relationships: {
          some: {
            tenantId: actor.tenantId,
            legalAccess: "FULL",
            startsAt: { lte: now },
            endedAt: null,
            revokedAt: null,
            child: { tenantId: actor.tenantId, isGuest: false },
          },
        },
      },
    },
    AND: [
      {
        participants: {
          some: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            kind: "STAFF",
            removedAt: null,
          },
        },
      },
      {
        participants: {
          some: {
            tenantId: actor.tenantId,
            kind: "GUARDIAN",
            removedAt: null,
          },
        },
      },
    ],
  };
}
