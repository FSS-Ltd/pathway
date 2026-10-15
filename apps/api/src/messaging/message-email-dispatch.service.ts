import { randomUUID } from "node:crypto";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import {
  MailerService,
  MessageEmailProviderRejectedError,
} from "../mailer/mailer.service";
import { decideMessageEmail } from "./message-email-policy";
import { requireCurrentStaff } from "./messaging-access";
import { withParentMessagingAccess } from "./parent-messaging-access";
import { requireStaffSchoolTeamAccess } from "./staff-school-team-access";

export interface MessageEmailEventScope {
  orgId: string;
  tenantId: string;
  conversationId: string;
  messageId: string;
}

@Injectable()
export class MessageEmailDispatchService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {}

  isAvailable(): boolean {
    return this.mailer.isMessageEmailAvailable();
  }

  async dispatch(
    scope: MessageEmailEventScope,
  ): Promise<{ sent: number; suppressed: number }> {
    const context = await withTenantRlsContext(
      scope.tenantId,
      scope.orgId,
      async (tx) => {
        const site = await tx.tenant.findFirst({
          where: { id: scope.tenantId, orgId: scope.orgId },
          select: { timezone: true },
        });
        const message = await tx.message.findFirst({
          where: {
            id: scope.messageId,
            tenantId: scope.tenantId,
            conversationId: scope.conversationId,
          },
          select: {
            conversation: { select: { kind: true } },
            deliveries: {
              select: {
                recipientParticipant: {
                  select: {
                    id: true,
                    userId: true,
                    kind: true,
                    removedAt: true,
                    mutedAt: true,
                    guardianIdentityId: true,
                    user: { select: { isActive: true, email: true } },
                  },
                },
              },
            },
          },
        });
        if (!site || !message)
          throw new Error("Message email event no longer matches its site");
        const userIds = message.deliveries.map(
          ({ recipientParticipant }) => recipientParticipant.userId,
        );
        const preferences = await tx.messageEmailPreference.findMany({
          where: { tenantId: scope.tenantId, userId: { in: userIds } },
          select: {
            userId: true,
            enabled: true,
            quietHoursStart: true,
            quietHoursEnd: true,
          },
        });
        return {
          timezone: site.timezone,
          kind: message.conversation.kind,
          recipients: message.deliveries.map(
            ({ recipientParticipant }) => recipientParticipant,
          ),
          preferences: new Map(preferences.map((item) => [item.userId, item])),
        };
      },
    );

    const result = { sent: 0, suppressed: 0 };
    for (const recipient of context.recipients) {
      const permitted = await this.isCurrentRecipient(
        scope,
        context.kind,
        recipient,
      );
      const preference = context.preferences.get(recipient.userId);
      const decision = decideMessageEmail({
        activeParticipant: recipient.removedAt === null,
        muted: recipient.mutedAt !== null,
        activeAccount: recipient.user.isActive,
        permitted,
        emailEnabled: preference?.enabled ?? false,
        email: recipient.user.email,
        quietHoursStart: preference?.quietHoursStart ?? null,
        quietHoursEnd: preference?.quietHoursEnd ?? null,
        timezone: context.timezone,
        now: new Date(),
      });
      if (!decision.send) {
        result.suppressed += 1;
        continue;
      }

      const destination = recipient.user.email;
      if (!destination) continue;

      const deliveryId = await this.claim(scope, recipient.id);
      if (!deliveryId) continue;
      let providerId: string;
      try {
        providerId = await this.mailer.sendMessageNotification(
          destination,
          deliveryId,
        );
      } catch (error) {
        // An uncertain provider outcome is terminal. The durable claim must never
        // be released for an automatic resend, even if the status write fails.
        await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
          tx.messageEmailDelivery.updateMany({
            where: {
              id: deliveryId,
              tenantId: scope.tenantId,
              status: "CLAIMED",
            },
            data: {
              status: "FAILED",
              failureCategory:
                error instanceof MessageEmailProviderRejectedError
                  ? "PROVIDER_REJECTED"
                  : "PROVIDER_OUTCOME_UNKNOWN",
            },
          }),
        );
        continue;
      }
      await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
        tx.messageEmailDelivery.update({
          where: { id: deliveryId },
          data: { status: "SENT", providerId, sentAt: new Date() },
        }),
      );
      result.sent += 1;
    }
    return result;
  }

  private async isCurrentRecipient(
    scope: MessageEmailEventScope,
    kind: "PARENT_STAFF" | "STAFF_DIRECT" | "STAFF_ROOM",
    recipient: {
      userId: string;
      kind: "GUARDIAN" | "STAFF";
      guardianIdentityId: string | null;
      removedAt: Date | null;
    },
  ): Promise<boolean> {
    if (recipient.removedAt) return false;
    if (recipient.kind === "GUARDIAN") {
      if (kind !== "PARENT_STAFF") return false;
      try {
        return await withParentMessagingAccess(
          scope.tenantId,
          recipient.userId,
          "messaging.messages.read",
          async (_tx, guardianId) =>
            guardianId === recipient.guardianIdentityId,
        );
      } catch (error) {
        if (error instanceof NotFoundException) return false;
        throw error;
      }
    }
    try {
      await withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
        const actor = {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          userId: recipient.userId,
        };
        if (kind === "PARENT_STAFF") {
          await requireStaffSchoolTeamAccess(tx, actor, new Date());
        } else {
          await requireCurrentStaff(tx, actor);
        }
      });
      const permission = await this.permissions.resolve({
        userId: recipient.userId,
        orgId: scope.orgId,
        tenantId: scope.tenantId,
        permission: "messaging.messages.read",
        now: new Date(),
      });
      return permission.allowed;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return false;
      throw error;
    }
  }

  private async claim(
    scope: MessageEmailEventScope,
    recipientParticipantId: string,
  ): Promise<string | null> {
    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO app."MessageEmailDelivery"
          ("id", "tenantId", "messageId", "recipientParticipantId")
        VALUES (${randomUUID()}, ${scope.tenantId}, ${scope.messageId}, ${recipientParticipantId})
        ON CONFLICT ("tenantId", "messageId", "recipientParticipantId") DO NOTHING
        RETURNING "id"
      `;
      return rows[0]?.id ?? null;
    });
  }
}
