import {
  Injectable,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  applyTenantContext,
  runReadOnlyTransaction,
  runTransaction,
} from "@pathway/db";
import { z } from "zod";
import { MailerService } from "../mailer/mailer.service";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { resolveHomeworkEmailRecipient } from "./homework-email-access";

const payloadSchema = z
  .object({
    tenantId: z.string().uuid(),
    recipientId: z.string().uuid(),
    sourceId: z.string().uuid(),
    action: z.enum(["ASSIGNED", "SUBMITTED", "RETURNED", "RELEASED"]),
    audience: z.enum(["STUDENT", "GUARDIAN", "STAFF"]),
    userId: z.string().uuid(),
  })
  .strict();

@Injectable()
export class HomeworkEmailRunnerService {
  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async runDue(): Promise<{
    inspected: number;
    sent: number;
    suppressed: number;
    failed: number;
  }> {
    if (
      process.env.ACE_HOMEWORK_REVIEWS_ENABLED !== "true" ||
      process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED !== "true"
    ) {
      return { inspected: 0, sent: 0, suppressed: 0, failed: 0 };
    }
    if (!this.mailer.isHomeworkEmailAvailable()) {
      throw new ServiceUnavailableException(
        "Homework email provider unavailable",
      );
    }
    const orgs = await runReadOnlyTransaction(
      (tx) =>
        tx.$queryRaw<Array<{ orgId: string }>>`
        SELECT "orgId" FROM app.list_due_homework_email_org_ids() LIMIT 20
      `,
    );
    const result = { inspected: 0, sent: 0, suppressed: 0, failed: 0 };
    for (const { orgId } of orgs) {
      while (result.inspected < 10) {
        const claim = await this.claim(orgId);
        if (!claim) break;
        result.inspected += 1;
        if (claim.kind === "expired") {
          result.failed += 1;
          continue;
        }
        const event = claim.event;
        const parsed = payloadSchema.safeParse(event.payload);
        if (
          !parsed.success ||
          event.aggregateType !== "ACE_HOMEWORK" ||
          event.aggregateId !== parsed.data.sourceId
        ) {
          await this.finish(
            orgId,
            event.id,
            "DEAD_LETTER",
            "INVALID_HOMEWORK_EVENT",
          );
          result.failed += 1;
          continue;
        }
        let email: string | null;
        try {
          email = await resolveHomeworkEmailRecipient(orgId, parsed.data);
          if (email && parsed.data.audience === "STAFF") {
            const decision = await this.permissions.resolve({
              userId: parsed.data.userId,
              orgId,
              tenantId: parsed.data.tenantId,
              permission: "ace.homework.reviews.manage",
              now: new Date(),
            });
            if (!decision.allowed) email = null;
          }
        } catch {
          await this.finish(
            orgId,
            event.id,
            "DEAD_LETTER",
            "HOMEWORK_ELIGIBILITY_CHECK_FAILED",
          );
          result.failed += 1;
          continue;
        }
        if (!email) {
          await this.finish(orgId, event.id, "DISPATCHED", null);
          result.suppressed += 1;
          continue;
        }
        try {
          await this.mailer.sendHomeworkNotification(email, event.id);
          await this.finish(orgId, event.id, "DISPATCHED", null);
          result.sent += 1;
        } catch {
          // The provider may have accepted the message before a timeout. Never
          // automatically retry an uncertain send; the outbox claim is durable.
          await this.finish(
            orgId,
            event.id,
            "DEAD_LETTER",
            "HOMEWORK_EMAIL_OUTCOME_UNKNOWN",
          );
          result.failed += 1;
        }
      }
    }
    if (result.failed > 0) {
      throw new ServiceUnavailableException(
        `${result.failed} homework email events need review`,
      );
    }
    return result;
  }

  private async claim(orgId: string) {
    return runTransaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 5 * 60_000);
      const due = {
        OR: [
          { status: "PENDING" as const, nextAttemptAt: { lte: now } },
          { status: "PROCESSING" as const, claimedAt: { lte: expiredAt } },
        ],
      };
      const candidate = await tx.outboxEvent.findFirst({
        where: {
          orgId,
          eventType: "ace.homework.email",
          ...due,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          aggregateId: true,
          aggregateType: true,
          payload: true,
          status: true,
        },
      });
      if (!candidate) return null;
      if (candidate.status === "PROCESSING") {
        const expired = await tx.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            orgId,
            status: "PROCESSING",
            claimedAt: { lte: expiredAt },
          },
          data: {
            status: "DEAD_LETTER",
            claimedAt: null,
            failedAt: now,
            lastError: "HOMEWORK_EMAIL_CLAIM_EXPIRED",
          },
        });
        return expired.count === 1 ? { kind: "expired" as const } : null;
      }
      const claimed = await tx.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          orgId,
          status: "PENDING",
          nextAttemptAt: { lte: now },
        },
        data: {
          status: "PROCESSING",
          claimedAt: now,
          attempts: { increment: 1 },
        },
      });
      return claimed.count === 1
        ? { kind: "event" as const, event: candidate }
        : null;
    });
  }

  private async finish(
    orgId: string,
    eventId: string,
    status: "DISPATCHED" | "DEAD_LETTER",
    error: string | null,
  ): Promise<void> {
    await runTransaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      await tx.outboxEvent.update({
        where: { id: eventId },
        data: {
          status,
          claimedAt: null,
          lastError: error,
          dispatchedAt: status === "DISPATCHED" ? new Date() : null,
          failedAt: status === "DEAD_LETTER" ? new Date() : null,
        },
      });
    });
  }
}
