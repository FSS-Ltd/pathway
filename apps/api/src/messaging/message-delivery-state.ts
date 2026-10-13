import type { Prisma } from "@pathway/db";

export type PersistedDeliveryState = "sent" | "delivered" | "read";

interface OutgoingMessage {
  id: string;
  sequence: number;
}

export async function deliveryStatesForMessages(
  tx: Prisma.TransactionClient,
  tenantId: string,
  conversationId: string,
  messages: OutgoingMessage[],
): Promise<Map<string, PersistedDeliveryState>> {
  if (messages.length === 0) return new Map();

  const deliveries = await tx.messageDelivery.findMany({
    where: {
      tenantId,
      messageId: { in: messages.map((message) => message.id) },
    },
    select: { messageId: true, recipientParticipantId: true, status: true },
  });
  const recipientIds = [
    ...new Set(deliveries.map((delivery) => delivery.recipientParticipantId)),
  ];
  const readCursors = recipientIds.length
    ? await tx.messageParticipantReadCursor.findMany({
        where: {
          tenantId,
          conversationId,
          participantId: { in: recipientIds },
        },
        select: { participantId: true, lastReadSequence: true },
      })
    : [];
  const readSequenceByRecipient = new Map(
    readCursors.map((cursor) => [
      cursor.participantId,
      cursor.lastReadSequence,
    ]),
  );
  const deliveriesByMessage = new Map<string, typeof deliveries>();
  for (const delivery of deliveries) {
    const rows = deliveriesByMessage.get(delivery.messageId) ?? [];
    rows.push(delivery);
    deliveriesByMessage.set(delivery.messageId, rows);
  }

  return new Map<string, PersistedDeliveryState>(
    messages.map((message): [string, PersistedDeliveryState] => {
      const recipients = deliveriesByMessage.get(message.id) ?? [];
      if (recipients.length === 0) return [message.id, "sent"];
      const states = recipients.map((delivery) => {
        if (
          delivery.status === "READ" ||
          (readSequenceByRecipient.get(delivery.recipientParticipantId) ?? 0) >=
            message.sequence
        ) {
          return "read";
        }
        return delivery.status === "DELIVERED" ? "delivered" : "sent";
      });
      return [
        message.id,
        states.every((state) => state === "read")
          ? "read"
          : states.every((state) => state !== "sent")
            ? "delivered"
            : "sent",
      ];
    }),
  );
}
