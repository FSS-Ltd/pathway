import {
  BillingEventProcessingStatus,
  BillingProvider,
  Prisma,
} from "@pathway/db";
import { claimBillingEvent, finishBillingEvent } from "../billing-event-processing";

const billingEventMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  updateMany: jest.fn(),
  update: jest.fn(),
};

jest.mock("@pathway/db", () => ({
  ...jest.requireActual("@pathway/db"),
  get prisma() { return { billingEvent: billingEventMock }; },
}));

const event = {
  provider: BillingProvider.STRIPE,
  eventId: "evt_1",
  kind: "invoice.paid",
  orgId: "org_1",
  subscriptionId: "sub_1",
};

const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError(
  "Duplicate event",
  { code: "P2002", clientVersion: "5.22.0" },
);

describe("billing event processing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    billingEventMock.create.mockResolvedValue({ id: "record_1" });
    billingEventMock.updateMany.mockResolvedValue({ count: 1 });
  });

  it("claims provider identity before effects and completes the persisted record", async () => {
    expect(await claimBillingEvent(event)).toEqual({ status: "claimed", id: "record_1" });
    expect(billingEventMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerEventId: "evt_1",
        processingStatus: BillingEventProcessingStatus.PROCESSING,
      }),
    }));

    await finishBillingEvent("record_1", "org_1", true);
    expect(billingEventMock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        processingStatus: BillingEventProcessingStatus.COMPLETED,
        orgId: "org_1",
      }),
    }));
  });

  it("ignores a completed delivery with the same provider event identity", async () => {
    billingEventMock.create.mockRejectedValue(uniqueViolation());
    billingEventMock.findUnique.mockResolvedValue({
      id: "record_1",
      processingStatus: BillingEventProcessingStatus.COMPLETED,
    });
    expect(await claimBillingEvent(event)).toEqual({ status: "duplicate" });
    expect(billingEventMock.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims a failed delivery atomically", async () => {
    billingEventMock.create.mockRejectedValue(uniqueViolation());
    billingEventMock.findUnique.mockResolvedValue({
      id: "record_1",
      processingStatus: BillingEventProcessingStatus.FAILED,
      processingStartedAt: new Date(),
    });
    expect(await claimBillingEvent(event)).toEqual({ status: "claimed", id: "record_1" });
    expect(billingEventMock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "record_1",
        processingStatus: BillingEventProcessingStatus.FAILED,
      }),
    }));
  });

  it("refuses a concurrent delivery while the first claim is live", async () => {
    billingEventMock.create.mockRejectedValue(uniqueViolation());
    billingEventMock.findUnique.mockResolvedValue({
      id: "record_1",
      processingStatus: BillingEventProcessingStatus.PROCESSING,
      processingStartedAt: new Date(),
    });
    await expect(claimBillingEvent(event)).rejects.toThrow("already processing");
    expect(billingEventMock.updateMany).not.toHaveBeenCalled();
  });
});
