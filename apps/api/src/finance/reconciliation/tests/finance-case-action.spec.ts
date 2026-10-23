import {
  financeCaseActionSchema,
  financeCaseListSchema,
} from "../../dto/finance-reconciliation.dto";
import { assertFinanceCaseAction } from "../finance-case-action";

describe("staff reconciliation actions", () => {
  it("acknowledgement cannot resolve or act on changed evidence", () => {
    expect(() =>
      assertFinanceCaseAction("RESOLVED", new Date(0), new Date(0)),
    ).toThrow();
    expect(() =>
      assertFinanceCaseAction("OPEN", new Date(1), new Date(0)),
    ).toThrow();
    expect(() =>
      assertFinanceCaseAction("ACKNOWLEDGED", new Date(0), new Date(0)),
    ).not.toThrow();
  });
  it("requires a reason, optimistic evidence version and request identity", () => {
    expect(financeCaseActionSchema.safeParse({ reason: "ok" }).success).toBe(
      false,
    );
    expect(financeCaseListSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(financeCaseListSchema.safeParse({ currency: "gbp" }).success).toBe(
      false,
    );
  });
});
