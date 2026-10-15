import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import {
  assertMessagingActor,
  requireCurrentStaff,
  type MessagingActor,
} from "./messaging-access";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";
import { requireStaffSchoolTeamAccess } from "./staff-school-team-access";

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
export const messageEmailPreferenceSchema = z
  .object({
    enabled: z.boolean(),
    quietHoursStart: time.nullable(),
    quietHoursEnd: time.nullable(),
  })
  .strict()
  .refine(
    ({ quietHoursStart, quietHoursEnd }) =>
      (quietHoursStart === null && quietHoursEnd === null) ||
      (quietHoursStart !== null &&
        quietHoursEnd !== null &&
        quietHoursStart !== quietHoursEnd),
    { message: "Choose two different quiet-hour times, or leave both empty" },
  );

export const messageMuteSchema = z.object({ muted: z.boolean() }).strict();

export type MessageEmailPreferenceInput = z.infer<
  typeof messageEmailPreferenceSchema
>;

@Injectable()
export class MessageEmailPreferencesService {
  async getStaff(actor: MessagingActor) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      return this.read(tx, actor.tenantId, actor.userId);
    });
  }

  async saveStaff(actor: MessagingActor, input: MessageEmailPreferenceInput) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      return this.write(tx, actor.tenantId, actor.userId, input);
    });
  }

  getParent(siteId: string, userId: string) {
    return withParentMessagingAccess(
      siteId,
      userId,
      "messaging.messages.read",
      (tx) => this.read(tx, siteId, userId),
    );
  }

  saveParent(
    siteId: string,
    userId: string,
    input: MessageEmailPreferenceInput,
  ) {
    return withParentMessagingAccess(
      siteId,
      userId,
      "messaging.messages.read",
      (tx) => this.write(tx, siteId, userId, input),
    );
  }

  async muteStaff(
    actor: MessagingActor,
    conversationId: string,
    muted: boolean,
  ) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const participant = await this.staffParticipant(
        tx,
        actor,
        conversationId,
      );
      return this.setMute(tx, actor.tenantId, participant.id, muted);
    });
  }

  async getMuteStaff(actor: MessagingActor, conversationId: string) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const participant = await this.staffParticipant(
        tx,
        actor,
        conversationId,
      );
      return { muted: participant.mutedAt !== null };
    });
  }

  muteParent(
    siteId: string,
    userId: string,
    conversationId: string,
    muted: boolean,
  ) {
    return withParentMessagingAccess(
      siteId,
      userId,
      "messaging.messages.read",
      async (tx, guardianId) => {
        const participant = await this.parentParticipant(
          tx,
          siteId,
          userId,
          conversationId,
          guardianId,
        );
        return this.setMute(tx, siteId, participant.id, muted);
      },
    );
  }

  getMuteParent(siteId: string, userId: string, conversationId: string) {
    return withParentMessagingAccess(
      siteId,
      userId,
      "messaging.messages.read",
      async (tx, guardianId) => {
        const participant = await this.parentParticipant(
          tx,
          siteId,
          userId,
          conversationId,
          guardianId,
        );
        return { muted: participant.mutedAt !== null };
      },
    );
  }

  private async staffParticipant(
    tx: Prisma.TransactionClient,
    actor: MessagingActor,
    conversationId: string,
  ) {
    const participant = await tx.messageParticipant.findFirst({
      where: {
        tenantId: actor.tenantId,
        conversationId,
        userId: actor.userId,
        kind: "STAFF",
        removedAt: null,
      },
      select: {
        id: true,
        mutedAt: true,
        conversation: { select: { kind: true } },
      },
    });
    if (!participant) throw new NotFoundException("Conversation not found");
    if (participant.conversation.kind === "PARENT_STAFF") {
      await requireStaffSchoolTeamAccess(tx, actor, new Date());
    } else {
      await requireCurrentStaff(tx, actor);
    }
    return participant;
  }

  private async parentParticipant(
    tx: Prisma.TransactionClient,
    siteId: string,
    userId: string,
    conversationId: string,
    guardianId: string,
  ) {
    const participant = await tx.messageParticipant.findFirst({
      where: {
        tenantId: siteId,
        conversationId,
        userId,
        kind: "GUARDIAN",
        guardianIdentityId: guardianId,
        removedAt: null,
        conversation: parentConversationScope(siteId, userId, guardianId),
      },
      select: { id: true, mutedAt: true },
    });
    if (!participant) throw new NotFoundException("Conversation not found");
    return participant;
  }

  private async read(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const [site, preference] = await Promise.all([
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true },
      }),
      tx.messageEmailPreference.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { enabled: true, quietHoursStart: true, quietHoursEnd: true },
      }),
    ]);
    return {
      enabled: preference?.enabled ?? false,
      quietHoursStart: preference?.quietHoursStart ?? null,
      quietHoursEnd: preference?.quietHoursEnd ?? null,
      timezone: site?.timezone ?? null,
    };
  }

  private async write(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    input: MessageEmailPreferenceInput,
  ) {
    const site = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (input.enabled && !site?.timezone) {
      throw new BadRequestException(
        "School timezone must be configured before email alerts can be enabled",
      );
    }
    await tx.$executeRaw`
      INSERT INTO app."MessageEmailPreference"
        ("id", "tenantId", "userId", "enabled", "quietHoursStart", "quietHoursEnd")
      VALUES (${randomUUID()}, ${tenantId}, ${userId}, ${input.enabled},
        ${input.quietHoursStart}, ${input.quietHoursEnd})
      ON CONFLICT ("tenantId", "userId") DO UPDATE SET
        "enabled" = EXCLUDED."enabled",
        "quietHoursStart" = EXCLUDED."quietHoursStart",
        "quietHoursEnd" = EXCLUDED."quietHoursEnd",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
    return { ...input, timezone: site?.timezone ?? null };
  }

  private async setMute(
    tx: Prisma.TransactionClient,
    tenantId: string,
    participantId: string,
    muted: boolean,
  ) {
    const participant = await tx.messageParticipant.update({
      where: { id_tenantId: { id: participantId, tenantId } },
      data: { mutedAt: muted ? new Date() : null },
      select: { mutedAt: true },
    });
    return { muted: participant.mutedAt !== null };
  }
}
