import { parseFinanceCaseRequest } from "../finance-case-request.contracts";

const event = {
  eventId: "event",
  caseId: "case",
  createdAt: new Date(0),
  requestDetails: {
    action: "RECHECK",
    requestId: "5e143e77-6552-44d0-9462-dc7313570251",
    evidenceId: null,
  },
  caseKey: "unknown:checkout",
  kind: "UNKNOWN_OPERATION" as const,
  resourceReference: null,
  caseDetails: { operationId: "local-operation" },
};
describe("durable case request contract", () => {
  it("retains local identity needed for a scoped executable recheck", () => {
    expect(parseFinanceCaseRequest(event)).toMatchObject({
      action: "RECHECK",
      caseKey: "unknown:checkout",
      details: { operationId: "local-operation" },
    });
  });
  it("rejects replay without stored evidence and unrecognized actions", () => {
    expect(() =>
      parseFinanceCaseRequest({
        ...event,
        requestDetails: { ...event.requestDetails, action: "REPLAY" },
      }),
    ).toThrow();
    expect(() =>
      parseFinanceCaseRequest({
        ...event,
        requestDetails: { ...event.requestDetails, action: "RESOLVE" },
      }),
    ).toThrow();
  });
});
