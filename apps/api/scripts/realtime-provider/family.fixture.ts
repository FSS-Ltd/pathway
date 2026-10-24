import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { seedE2eAuthUser } from "../../test-helpers.e2e";
import { orgId, siteId, sender } from "./fixture";
import assert from "node:assert/strict";

import type { MessagingActor } from "../../src/messaging/messaging-access";

export interface FamilyFixture {
  responder: MessagingActor;
  guardianUserId: string;
  tagId: string;
  familyId: string;
  guardianParticipantId: string;
  responderParticipantId: string;
}

export async function seedFamily(): Promise<FamilyFixture> {
  const responder = sender;
  const guardianUserId = randomUUID();
  await prisma.org.update({
    where: { id: orgId },
    data: { parentPortalEnabled: true },
  });
  await seedE2eAuthUser({
    subject: guardianUserId,
    userId: guardianUserId,
    tenantId: siteId,
    orgId,
    hasFamilyAccess: true,
  });
  for (const userId of [responder.userId, guardianUserId]) {
    await prisma.user.update({
      where: { id: userId },
      data: { tenantId: siteId },
    });
  }
  return withTenantRlsContext(siteId, orgId, async (tx) => {
    const tag =
      (await tx.accessTagGrant.findFirst({
        where: {
          orgId,
          tenantId: siteId,
          userId: responder.userId,
          tagKey: "PARENT_MESSAGE_RESPONDER",
          revokedAt: null,
        },
      })) ??
      (await tx.accessTagGrant.create({
        data: {
          orgId,
          tenantId: siteId,
          userId: responder.userId,
          tagKey: "PARENT_MESSAGE_RESPONDER",
          grantedById: sender.userId,
          startsAt: new Date(Date.now() - 86_400_000),
        },
      }));
    const child = await tx.child.create({
      data: { tenantId: siteId, firstName: "Provider", lastName: "Family" },
    });
    const guardian = await tx.guardianIdentity.create({
      data: { tenantId: siteId, userId: guardianUserId },
    });
    await tx.guardianChildRelationship.create({
      data: {
        tenantId: siteId,
        guardianIdentityId: guardian.id,
        childId: child.id,
        legalAccess: "FULL",
        startsAt: new Date(Date.now() - 1000),
      },
    });
    const family = await tx.messageConversation.create({
      data: {
        kind: "PARENT_STAFF",
        tenant: { connect: { id: siteId } },
        createdBy: { connect: { id: guardianUserId } },
        guardianIdentity: {
          connect: { id_tenantId: { id: guardian.id, tenantId: siteId } },
        },
        participants: {
          create: [
            {
              kind: "GUARDIAN",
              tenant: { connect: { id: siteId } },
              user: { connect: { id: guardianUserId } },
              guardianIdentity: {
                connect: { id_tenantId: { id: guardian.id, tenantId: siteId } },
              },
            },
            {
              kind: "STAFF",
              tenant: { connect: { id: siteId } },
              user: { connect: { id: responder.userId } },
            },
          ],
        },
      },
      include: { participants: true },
    });
    const guardianParticipant = family.participants.find(
      (participant) => participant.kind === "GUARDIAN",
    );
    const responderParticipant = family.participants.find(
      (participant) => participant.kind === "STAFF",
    );
    assert.ok(guardianParticipant);
    assert.ok(responderParticipant);
    return {
      responder,
      guardianUserId,
      tagId: tag.id,
      familyId: family.id,
      guardianParticipantId: guardianParticipant.id,
      responderParticipantId: responderParticipant.id,
    };
  });
}
