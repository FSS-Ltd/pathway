import { ConflictException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import type { FinanceAccessScope } from "./access/finance-access.reader";

export interface FinanceCommandActor extends FinanceAccessScope {
  userId: string;
}

export type FinanceCommandType =
  | "CREATE_INVOICE"
  | "UPDATE_INVOICE"
  | "SUBMIT_INVOICE_FOR_REVIEW"
  | "APPROVE_INVOICE"
  | "REQUEST_INVOICE_CHANGES"
  | "ISSUE_INVOICE"
  | "VOID_INVOICE"
  | "CREATE_CREDIT_NOTE"
  | "UPDATE_CREDIT_NOTE"
  | "SUBMIT_CREDIT_FOR_REVIEW"
  | "APPROVE_CREDIT_NOTE"
  | "REQUEST_CREDIT_CHANGES"
  | "ISSUE_CREDIT_NOTE"
  | "VOID_CREDIT_NOTE"
  | "ALLOCATE_RECEIPT"
  | "REVERSE_ALLOCATION";

export type FinanceCommandResourceType =
  | "INVOICE"
  | "CREDIT_NOTE"
  | "ALLOCATION";

export interface FinanceCommandResult<T> {
  resourceId: string;
  value: T;
}

@Injectable()
export class FinanceCommandService {
  async execute<T>(input: {
    actor: FinanceCommandActor;
    idempotencyKey: string;
    commandType: FinanceCommandType;
    resourceType: FinanceCommandResourceType;
    request: unknown;
    perform: (tx: Prisma.TransactionClient) => Promise<FinanceCommandResult<T>>;
    replay: (tx: Prisma.TransactionClient, resourceId: string) => Promise<T>;
  }): Promise<T> {
    const requestHash = hashRequest(input.request);
    const scope = {
      tenantId: input.actor.tenantId,
      orgId: input.actor.orgId,
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
    };

    const run = () =>
      withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
        const existing = await tx.financeCommandReceipt.findUnique({
          where: { tenantId_orgId_actorUserId_idempotencyKey: scope },
        });
        if (existing) {
          return this.replayExisting(tx, existing, input, requestHash);
        }

        const result = await input.perform(tx);
        await tx.financeCommandReceipt.create({
          data: {
            ...scope,
            commandType: input.commandType,
            resourceType: input.resourceType,
            resourceId: result.resourceId,
            requestHash,
          },
        });
        return result.value;
      });

    try {
      return await run();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
        const existing = await tx.financeCommandReceipt.findUnique({
          where: { tenantId_orgId_actorUserId_idempotencyKey: scope },
        });
        if (!existing) throw error;
        return this.replayExisting(tx, existing, input, requestHash);
      });
    }
  }

  private async replayExisting<T>(
    tx: Prisma.TransactionClient,
    existing: {
      idempotencyKey: string;
      commandType: string;
      resourceType: string;
      resourceId: string | null;
      requestHash: string;
    },
    input: {
      commandType: FinanceCommandType;
      resourceType: FinanceCommandResourceType;
      replay: (tx: Prisma.TransactionClient, resourceId: string) => Promise<T>;
    },
    requestHash: string,
  ): Promise<T> {
    if (
      existing.commandType !== input.commandType ||
      existing.resourceType !== input.resourceType ||
      existing.requestHash !== requestHash
    ) {
      throw new ConflictException(
        "Idempotency-Key was already used for a different Finance command",
      );
    }
    if (!existing.resourceId) {
      throw new ConflictException("Finance command is still being processed");
    }
    return input.replay(tx, existing.resourceId);
  }
}

function hashRequest(request: unknown): string {
  const canonical = JSON.stringify(request);
  if (!canonical)
    throw new TypeError("Finance command request is not serializable");
  return createHash("sha256").update(canonical).digest("hex");
}
