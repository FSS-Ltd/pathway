import type { Prisma } from "@pathway/db";
import { z } from "zod";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-recovery-page-runner";

type CaseKind = Prisma.FinanceReconciliationCaseGetPayload<
  Record<string, never>
>["kind"];
export interface FinanceCaseRequestRow {
  eventId: string;
  caseId: string;
  createdAt: Date;
  requestDetails: Prisma.JsonValue;
  caseKey: string;
  kind: CaseKind;
  resourceReference: string | null;
  caseDetails: Prisma.JsonValue;
}
export interface FinanceCaseRequest {
  eventId: string;
  caseId: string;
  requestId: string;
  action: "RECHECK" | "REPLAY";
  evidenceId: string | null;
  createdAt: Date;
  caseKey: string;
  kind: CaseKind;
  resourceReference: string | null;
  details: Prisma.JsonValue;
}
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RECHECK"),
    requestId: z.string().uuid(),
    evidenceId: z.null(),
  }),
  z.object({
    action: z.literal("REPLAY"),
    requestId: z.string().uuid(),
    evidenceId: z.string().uuid(),
  }),
]);
export function parseFinanceCaseRequest(
  row: FinanceCaseRequestRow,
): FinanceCaseRequest {
  const request = requestSchema.parse(row.requestDetails);
  return {
    eventId: row.eventId,
    caseId: row.caseId,
    createdAt: row.createdAt,
    caseKey: row.caseKey,
    kind: row.kind,
    resourceReference: row.resourceReference,
    details: row.caseDetails,
    ...request,
  };
}
export interface PreparedFinanceCaseRecheck {
  outcome: string;
  capture(
    tx: Prisma.TransactionClient,
    scope: FinanceConnectionScope,
    now: Date,
    mode: "sync" | "dry-run",
  ): Promise<FinanceReconciliationPageSummary>;
}
export type PrepareFinanceCaseRecheck = (
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
) => Promise<PreparedFinanceCaseRecheck>;
