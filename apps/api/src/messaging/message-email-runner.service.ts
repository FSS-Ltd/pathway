import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  applyTenantContext,
  runReadOnlyTransaction,
  runTransaction,
} from "@pathway/db";
import { z } from "zod";
import {
  MessageEmailDispatchService,
  type MessageEmailEventScope,
} from "./message-email-dispatch.service";

const eventPayload = z
  .object({
    tenantId: z.string().min(1),
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
  })
  .strict();

interface ClaimedMessageEvent {
  id: string;
  orgId: string;
  aggregateId: string;
  aggregateType: string;
  payload: unknown;
  attempts: number;
}

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_EVENTS_PER_RUN = 3;

@Injectable()
export class MessageEmailRunnerService {
  constructor(
    @Inject(MessageEmailDispatchService)
    private readonly dispatch: MessageEmailDispatchService,
  ) {}

  async runDue(): Promise<{
    inspected: number;
    sent: number;
    suppressed: number;
    retried: number;
    deadLettered: number;
  }> {
    if (!this.dispatch.isAvailable()) {
      throw new ServiceUnavailableException(
        "Message email provider is unavailable",
      );
    }
    const orgs = await runReadOnlyTransaction(
      (tx) =>
        tx.$queryRaw<Array<{ orgId: string }>>`
        SELECT "orgId" FROM app.list_due_message_email_org_ids() LIMIT 20
      `,
    );
    const result = {
      inspected: 0,
      sent: 0,
      suppressed: 0,
      retried: 0,
      deadLettered: 0,
    };
    for (const { orgId } of orgs) {
      if (result.inspected >= MAX_EVENTS_PER_RUN) break;
      const event = await this.claim(orgId);
      if (!event) continue;
      result.inspected += 1;
      const parsed = eventPayload.safeParse(event.payload);
      if (
        !parsed.success ||
        parsed.data.messageId !== event.aggregateId ||
        event.aggregateType !== "ACE_MESSAGE"
      ) {
        await this.finish(
          orgId,
          event.id,
          "DEAD_LETTER",
          "INVALID_MESSAGE_EVENT",
        );
        result.deadLettered += 1;
        continue;
      }
      const scope: MessageEmailEventScope = { orgId, ...parsed.data };
      try {
        const outcome = await this.dispatch.dispatch(scope);
        result.sent += outcome.sent;
        result.suppressed += outcome.suppressed;
        await this.finish(orgId, event.id, "DISPATCHED", null);
      } catch {
        const terminal = event.attempts + 1 >= MAX_ATTEMPTS;
        if (terminal) result.deadLettered += 1;
        else result.retried += 1;
        await this.finish(
          orgId,
          event.id,
          terminal ? "DEAD_LETTER" : "PENDING",
          "MESSAGE_EMAIL_DISPATCH_FAILED",
        );
      }
    }
    if (result.retried > 0 || result.deadLettered > 0) {
      throw new ServiceUnavailableException(
        `${result.retried} message email events need retry; ${result.deadLettered} reached terminal failure`,
      );
    }
    return result;
  }

  private async claim(orgId: string): Promise<ClaimedMessageEvent | null> {
    return runTransaction(async (tx) => {
      await applyTenantContext(tx, "", orgId);
      const now = new Date();
      const due = {
        OR: [
          { status: "PENDING" as const, nextAttemptAt: { lte: now } },
          {
            status: "PROCESSING" as const,
            claimedAt: { lte: new Date(now.getTime() - LEASE_MS) },
          },
        ],
      };
      const candidate = await tx.outboxEvent.findFirst({
        where: { orgId, eventType: "ace.message.sent", ...due },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          orgId: true,
          aggregateId: true,
          aggregateType: true,
          payload: true,
          attempts: true,
        },
      });
      if (!candidate) return null;
      const claimed = await tx.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          orgId,
          eventType: "ace.message.sent",
          ...due,
        },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
          claimedAt: now,
        },
      });
      return claimed.count === 1 ? candidate : null;
    });
  }

  private async finish(
    orgId: string,
    eventId: string,
    status: "DISPATCHED" | "DEAD_LETTER" | "PENDING",
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
          nextAttemptAt:
            status === "PENDING" ? new Date(Date.now() + 60_000) : undefined,
          dispatchedAt: status === "DISPATCHED" ? new Date() : undefined,
          failedAt: status === "DEAD_LETTER" ? new Date() : undefined,
        },
      });
    });
  }
}
