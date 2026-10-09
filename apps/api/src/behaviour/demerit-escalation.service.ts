import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { evaluateDemeritStage } from "@pathway/ace-domain";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../common/outbox/outbox.service";
import { MailerService } from "../mailer/mailer.service";
import { findActiveReviewers } from "./behaviour-review-access";
import { findActiveDemeritPolicy } from "./demerit-policy.repository";
import {
  guardianNotificationIntentSchema,
  isIanaTimezone,
  localDateWindow,
  summariseDemerits,
  toPolicyInput,
  uniqueRecipients,
  uniqueSorted,
  type CreateDemeritIntentsInput,
  type EscalationPredecessor,
  type DemeritEscalationResult,
  type DemeritPolicyRecord,
  type GuardianNotificationIntent,
  type LocalDateWindow,
  type WindowedDemerit,
} from "./demerit-escalation.support";

export type {
  CreateDemeritIntentsInput,
  DemeritEscalationResult,
  GuardianNotificationIntent,
} from "./demerit-escalation.support";

@Injectable()
export class DemeritEscalationService {
  constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(MailerService) private readonly mailer: MailerService,
  ) {}

  async createIntents(
    tx: Prisma.TransactionClient,
    input: CreateDemeritIntentsInput,
  ): Promise<DemeritEscalationResult | null> {
    if (input.entry.type !== "DEMERIT") return null;
    if (!isIanaTimezone(input.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }

    const policy = await this.findActivePolicy(
      tx,
      input.actor.tenantId,
      input.entry.occurredAt,
    );
    const window = localDateWindow(
      input.entry.occurredAt,
      input.timezone,
      policy.windowDays,
    );
    const priorEntries = await tx.behaviourEntry.findMany({
      where: {
        tenantId: input.actor.tenantId,
        childId: input.entry.childId,
        type: "DEMERIT",
        correction: { is: null },
        id: { not: input.entry.id },
        occurredAt: { gte: window.start, lt: window.end },
      },
      select: {
        pointsDelta: true,
        occurredAt: true,
        categoryIsSerious: true,
      },
    });
    const override = await tx.demeritStageOverride.findFirst({
      where: {
        tenantId: input.actor.tenantId,
        childId: input.entry.childId,
        demeritPolicyId: policy.id,
        expiresAt: { gt: input.now },
      },
      orderBy: [{ stage: "desc" }, { createdAt: "desc" }],
      select: { stage: true },
    });

    const previousEntries = this.previousEntries(
      priorEntries,
      input.predecessor,
      window,
    );
    const previousSummary = summariseDemerits(previousEntries);
    const currentSummary = summariseDemerits([...priorEntries, input.entry]);
    const previous = evaluateDemeritStage({
      ...toPolicyInput(policy),
      ...previousSummary,
      manualStage: override?.stage,
    });
    const current = evaluateDemeritStage({
      ...toPolicyInput(policy),
      ...currentSummary,
      manualStage: override?.stage,
    });

    if (current.requiresNote && !input.entry.note?.trim()) {
      throw new BadRequestException(
        "A note is required for this demerit escalation",
      );
    }

    const seriousnessIntroducedByFact =
      input.entry.categoryIsSerious === true &&
      input.predecessor?.categoryIsSerious !== true;
    if (!seriousnessIntroducedByFact && current.action === previous.action) {
      return {
        stage: current.stage,
        action: current.action,
        policyVersion: policy.version,
        createdIntentCount: 0,
      };
    }

    const createdIntentCount = await this.enqueueActionIntent(tx, {
      ...input,
      stage: current.stage,
      action: current.action,
      policyVersion: policy.version,
      occurredOn: window.occurredOn,
    });
    return {
      stage: current.stage,
      action: current.action,
      policyVersion: policy.version,
      createdIntentCount,
    };
  }

  async deliverGuardianNotification(
    unsafeIntent: GuardianNotificationIntent,
  ): Promise<{ sent: number }> {
    const intent = guardianNotificationIntentSchema.parse(unsafeIntent);
    const deliveryNow = new Date();
    const delivery = await withTenantRlsContext(
      intent.payload.tenantId,
      intent.payload.orgId,
      async (tx) => {
        const [site, child, relationships] = await Promise.all([
          tx.tenant.findFirst({
            where: {
              id: intent.payload.tenantId,
              orgId: intent.payload.orgId,
            },
            select: { name: true },
          }),
          tx.child.findFirst({
            where: {
              id: intent.payload.childId,
              tenantId: intent.payload.tenantId,
            },
            select: {
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          }),
          tx.guardianChildRelationship.findMany({
            where: {
              tenantId: intent.payload.tenantId,
              childId: intent.payload.childId,
              guardianIdentity: {
                userId: { in: intent.payload.recipientUserIds },
                user: { isActive: true, email: { not: null } },
              },
              legalAccess: { not: "NONE" },
              startsAt: { lte: deliveryNow },
              revokedAt: null,
              OR: [{ endedAt: null }, { endedAt: { gt: deliveryNow } }],
            },
            select: {
              guardianIdentity: {
                select: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      name: true,
                      displayName: true,
                      firstName: true,
                    },
                  },
                },
              },
            },
          }),
        ]);
        if (!site || !child) {
          throw new NotFoundException("Behaviour notification scope not found");
        }
        return { site, child, relationships };
      },
    );

    const childName = delivery.child.preferredName ?? delivery.child.firstName;
    const recipients = uniqueRecipients(
      delivery.relationships.map(
        ({ guardianIdentity }) => guardianIdentity.user,
      ),
    );
    for (const recipient of recipients) {
      await this.mailer.sendBehaviourNotification({
        to: recipient.email,
        guardianName:
          recipient.displayName ??
          recipient.name ??
          recipient.firstName ??
          "Parent or guardian",
        childName,
        siteName: delivery.site.name,
        stage: intent.payload.stage,
        occurredOn: intent.payload.occurredOn,
        idempotencyKey: `${intent.idempotencyKey}:${recipient.id}`,
      });
    }

    return { sent: recipients.length };
  }

  async dispatch(unsafeIntent: unknown): Promise<{ sent: number }> {
    const intent = guardianNotificationIntentSchema.safeParse(unsafeIntent);
    if (!intent.success) {
      throw new BadRequestException("Invalid behaviour outbox intent");
    }
    return this.deliverGuardianNotification(intent.data);
  }

  private async findActivePolicy(
    tx: Prisma.TransactionClient,
    tenantId: string,
    now: Date,
  ): Promise<DemeritPolicyRecord> {
    const policy = await findActiveDemeritPolicy(tx, tenantId, now);
    if (!policy) throw new NotFoundException("Active demerit policy not found");
    return policy;
  }

  private previousEntries(
    priorEntries: WindowedDemerit[],
    predecessor: EscalationPredecessor | null,
    window: LocalDateWindow,
  ): WindowedDemerit[] {
    if (
      predecessor?.type !== "DEMERIT" ||
      predecessor.occurredAt < window.start ||
      predecessor.occurredAt >= window.end
    ) {
      return priorEntries;
    }
    return [...priorEntries, predecessor];
  }

  private async enqueueActionIntent(
    tx: Prisma.TransactionClient,
    input: CreateDemeritIntentsInput & {
      stage: number;
      action: "none" | "review" | "notify" | "head-review";
      policyVersion: number;
      occurredOn: string;
    },
  ): Promise<number> {
    if (input.action === "none") return 0;
    if (input.action === "notify") {
      const recipientUserIds = await this.findGuardianUserIds(tx, input);
      if (recipientUserIds.length === 0) return 0;
      await this.outbox.enqueue(tx, {
        aggregateType: "BEHAVIOUR_ENTRY",
        aggregateId: input.entry.id,
        eventType: "behaviour.guardian-notification.requested",
        payload: this.basePayload(input, recipientUserIds),
        idempotencyKey: `behaviour-guardian-notification:${input.entry.id}:${input.stage}`,
      });
      return 1;
    }

    const reviewKind = input.action === "head-review" ? "HEAD" : "SITE";
    const recipientUserIds = await findActiveReviewers(
      tx,
      input.actor,
      reviewKind,
      input.now,
    );
    await this.outbox.enqueue(tx, {
      aggregateType: "BEHAVIOUR_ENTRY",
      aggregateId: input.entry.id,
      eventType: "behaviour.review-requested",
      payload: {
        ...this.basePayload(input, recipientUserIds),
        reviewKind,
      },
      idempotencyKey: `behaviour-review:${input.entry.id}:${input.stage}:${reviewKind.toLowerCase()}`,
    });
    await tx.behaviourReviewRequest.createMany({
      data: [
        {
          tenantId: input.actor.tenantId,
          childId: input.entry.childId,
          behaviourEntryId: input.entry.id,
          kind: reviewKind,
          stage: input.stage,
          policyVersion: input.policyVersion,
          requestedAt: input.now,
        },
      ],
      skipDuplicates: true,
    });
    return 1;
  }

  private basePayload(
    input: CreateDemeritIntentsInput & {
      stage: number;
      policyVersion: number;
      occurredOn: string;
    },
    recipientUserIds: string[],
  ) {
    return {
      behaviourEntryId: input.entry.id,
      childId: input.entry.childId,
      tenantId: input.actor.tenantId,
      orgId: input.actor.orgId,
      stage: input.stage,
      demeritPolicyVersion: input.policyVersion,
      occurredOn: input.occurredOn,
      recipientUserIds,
    };
  }

  private async findGuardianUserIds(
    tx: Prisma.TransactionClient,
    input: CreateDemeritIntentsInput,
  ): Promise<string[]> {
    const relationships = await tx.guardianChildRelationship.findMany({
      where: {
        tenantId: input.actor.tenantId,
        childId: input.entry.childId,
        legalAccess: { not: "NONE" },
        startsAt: { lte: input.now },
        revokedAt: null,
        OR: [{ endedAt: null }, { endedAt: { gt: input.now } }],
        guardianIdentity: { user: { isActive: true, email: { not: null } } },
      },
      select: { guardianIdentity: { select: { userId: true } } },
    });
    return uniqueSorted(
      relationships.map(({ guardianIdentity }) => guardianIdentity.userId),
    );
  }
}
