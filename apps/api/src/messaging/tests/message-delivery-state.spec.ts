import { deliveryStatesForMessages } from "../message-delivery-state";

const messages = [{ id: "message-1", sequence: 4 }];

function setup() {
  const tx = {
    messageDelivery: { findMany: jest.fn() },
    messageParticipantReadCursor: { findMany: jest.fn() },
  };
  return {
    tx,
    load: () =>
      deliveryStatesForMessages(tx as never, "site", "thread", messages),
  };
}

describe("message delivery state", () => {
  it("aggregates recipient state without returning individual readers", async () => {
    const { tx, load } = setup();
    tx.messageDelivery.findMany.mockResolvedValue([
      {
        messageId: "message-1",
        recipientParticipantId: "a",
        status: "DELIVERED",
      },
      {
        messageId: "message-1",
        recipientParticipantId: "b",
        status: "PENDING",
      },
    ]);
    tx.messageParticipantReadCursor.findMany.mockResolvedValue([]);
    expect(await load()).toEqual(new Map([["message-1", "sent"]]));

    tx.messageDelivery.findMany.mockResolvedValue([
      {
        messageId: "message-1",
        recipientParticipantId: "a",
        status: "DELIVERED",
      },
      {
        messageId: "message-1",
        recipientParticipantId: "b",
        status: "DELIVERED",
      },
    ]);
    expect(await load()).toEqual(new Map([["message-1", "delivered"]]));

    tx.messageParticipantReadCursor.findMany.mockResolvedValue([
      { participantId: "a", lastReadSequence: 4 },
      { participantId: "b", lastReadSequence: 4 },
    ]);
    expect(await load()).toEqual(new Map([["message-1", "read"]]));
    expect(tx.messageDelivery.findMany).toHaveBeenCalledTimes(3);
    expect(tx.messageParticipantReadCursor.findMany).toHaveBeenCalledTimes(3);
  });
});
