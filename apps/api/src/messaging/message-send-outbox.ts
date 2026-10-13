import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { SendMessageInput } from "./dto/messaging-command.dto";

interface MessageSendScope {
  tenantId: string;
  orgId: string;
  userId: string;
  conversationId: string;
  senderParticipantId: string;
}

interface MessageSendResult {
  id: string;
  conversationId: string;
  clientRequestId: string;
  sequence: number;
  body: string;
  createdAt: string;
  reused: boolean;
}

export function messageSendIdempotencyKey(
  tenantId: string,
  userId: string,
  clientRequestId: string,
): string {
  return `ace.message.send:${tenantId}:${userId}:${clientRequestId}`;
}

export async function findMessageRetry(
  tx: Prisma.TransactionClient,
  scope: MessageSendScope,
  input: SendMessageInput,
): Promise<MessageSendResult | null> {
  const idempotencyKey = messageSendIdempotencyKey(
    scope.tenantId,
    scope.userId,
    input.clientRequestId,
  );
  const event = await tx.outboxEvent.findUnique({
    where: {
      orgId_idempotencyKey: { orgId: scope.orgId, idempotencyKey },
    },
    select: { aggregateId: true },
  });
  const existing = await tx.message.findFirst({
    where: event
      ? {
          id: event.aggregateId,
          tenantId: scope.tenantId,
          senderParticipantId: scope.senderParticipantId,
        }
      : {
          tenantId: scope.tenantId,
          conversationId: scope.conversationId,
          senderParticipantId: scope.senderParticipantId,
          clientRequestId: input.clientRequestId,
        },
    select: {
      id: true,
      conversationId: true,
      sequence: true,
      bodyEncrypted: true,
      createdAt: true,
    },
  });
  if (event && !existing) {
    throw new ConflictException("Client request ID already used");
  }
  if (!existing) return null;
  if (
    existing.conversationId !== scope.conversationId ||
    existing.bodyEncrypted !== input.body
  ) {
    throw new ConflictException("Client request ID already used");
  }
  return {
    id: existing.id,
    conversationId: scope.conversationId,
    clientRequestId: input.clientRequestId,
    sequence: existing.sequence,
    body: existing.bodyEncrypted,
    createdAt: existing.createdAt.toISOString(),
    reused: true,
  };
}

export async function recordMessageSent(
  tx: Prisma.TransactionClient,
  scope: MessageSendScope,
  clientRequestId: string,
  messageId: string,
): Promise<void> {
  // A duplicate key must fail the transaction, including its message write.
  await tx.outboxEvent.create({
    data: {
      orgId: scope.orgId,
      aggregateType: "ACE_MESSAGE",
      aggregateId: messageId,
      eventType: "ace.message.sent",
      payload: {
        tenantId: scope.tenantId,
        conversationId: scope.conversationId,
        messageId,
      },
      idempotencyKey: messageSendIdempotencyKey(
        scope.tenantId,
        scope.userId,
        clientRequestId,
      ),
    },
    select: { id: true },
  });
}
