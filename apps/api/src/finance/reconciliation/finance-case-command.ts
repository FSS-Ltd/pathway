import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pathway/db";
import type { FinanceRequestActor } from "../finance-controller-support";
import type { FinanceCaseAction } from "../dto/finance-reconciliation.dto";
import type { FinanceAccessMode } from "../access/finance-access.types";
import { assertFinanceCaseAction } from "./finance-case-action";
import { caseInclude, caseView } from "./finance-case-view";

export async function executeFinanceCaseAction(
  tx: Prisma.TransactionClient,
  actor: FinanceRequestActor,
  id: string,
  action: "ACKNOWLEDGE" | "RECHECK" | "REPLAY",
  input: FinanceCaseAction,
  authorize: () => Promise<void>,
  resolveMode: () => Promise<FinanceAccessMode>,
) {
  if (action !== "REPLAY" && input.evidenceId)
    throw new BadRequestException(
      "Evidence selection is only valid for replay",
    );
  await tx.$queryRaw`SELECT "id" FROM "FinanceReconciliationCase" WHERE "id" = ${id} AND "tenantId" = ${actor.tenantId} AND "orgId" = ${actor.orgId} FOR UPDATE`;
  const row = await tx.financeReconciliationCase.findFirst({
    where: { id, tenantId: actor.tenantId, orgId: actor.orgId },
    include: caseInclude,
  });
  if (!row) throw new NotFoundException("Reconciliation case unavailable");
  const sameRequest = await tx.financeReconciliationCaseEvent.findFirst({
    where: {
      caseId: id,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      details: { path: ["requestId"], equals: input.requestId },
    },
  });
  const pending =
    action === "ACKNOWLEDGE"
      ? null
      : await tx.financeReconciliationCaseEvent.findFirst({
          where: {
            caseId: id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            type: "REPLAY_REQUESTED",
            AND: [
              { details: { path: ["action"], equals: action } },
              {
                details: {
                  path: ["evidenceId"],
                  equals: input.evidenceId ?? Prisma.JsonNull,
                },
              },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
  const pendingDetails = pending?.details;
  const pendingId =
    pendingDetails &&
    typeof pendingDetails === "object" &&
    !Array.isArray(pendingDetails) &&
    typeof pendingDetails.requestId === "string"
      ? pendingDetails.requestId
      : null;
  const completion = pendingId
    ? await tx.financeReconciliationCaseEvent.findFirst({
        where: {
          caseId: id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          type: "UPDATED",
          details: { path: ["completedRequestId"], equals: pendingId },
        },
      })
    : null;
  const existing = sameRequest ?? (completion ? null : pending);
  if (existing) {
    const details = existing.details;
    if (
      details &&
      typeof details === "object" &&
      !Array.isArray(details) &&
      (details.action !== action ||
        details.evidenceId !== (input.evidenceId ?? null))
    )
      throw new ConflictException(
        "Request identity already used for another action",
      );
    return {
      requestId:
        typeof existing.details === "object" &&
        existing.details &&
        !Array.isArray(existing.details)
          ? existing.details.requestId
          : input.requestId,
      status: "ALREADY_REQUESTED",
      connection: caseView(row).connection,
      accessMode: await resolveMode(),
    };
  }
  assertFinanceCaseAction(
    row.status,
    row.lastSeenAt,
    new Date(input.expectedLastSeenAt),
  );
  if (action === "REPLAY") {
    if (!input.evidenceId || !row.stripeConnection.stripeAccountId)
      throw new ConflictException(
        "Select stored evidence before requesting replay",
      );
    const evidence = await tx.financeStripeWebhookEvent.findFirst({
      where: {
        id: input.evidenceId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        stripeAccountId: row.stripeConnection.stripeAccountId,
        livemode: row.stripeConnection.livemode,
        OR: [
          { reconciliationConnectionId: row.stripeConnectionId },
          {
            reconciliationConnectionId: null,
            evidenceSource: "SIGNED_WEBHOOK",
          },
        ],
      },
    });
    if (!evidence) throw new NotFoundException("Scoped evidence unavailable");
  }
  await authorize();
  if (action === "ACKNOWLEDGE")
    await tx.financeReconciliationCase.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
  await tx.financeReconciliationCaseEvent.create({
    data: {
      caseId: id,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      actorUserId: actor.userId,
      type: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "REPLAY_REQUESTED",
      details: {
        action,
        requestId: input.requestId,
        evidenceId: input.evidenceId ?? null,
        reason: input.reason,
        expectedLastSeenAt: input.expectedLastSeenAt,
      },
    },
  });
  return {
    requestId: input.requestId,
    status: action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "REQUESTED",
    connection: caseView(row).connection,
    accessMode: await resolveMode(),
  };
}
