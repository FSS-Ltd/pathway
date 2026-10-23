import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, runTransaction, withTenantRlsContext } from "@pathway/db";
import { createHash, randomUUID } from "node:crypto";
import { FinanceAccessService } from "./access/finance-access.service";
import type {
  FinanceStatementListQuery,
  FinanceStatementRequestInput,
} from "./dto/finance-statement.dto";
import { FinanceBalanceService } from "./finance-balance.service";
import { buildFinanceStatementSnapshot } from "./finance-statement-snapshot";
import { londonMonthPeriod } from "./finance-statement-period";
import { FinanceStatementDocumentService } from "./finance-statement-document.service";
import { toFinanceStatementView } from "./finance-statement-records";
import type { FinanceStatementActor } from "./finance-statement.types";

type StatementKind = "ON_DEMAND" | "MONTH_END";

@Injectable()
export class FinanceStatementService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
    @Inject(FinanceStatementDocumentService)
    private readonly documents: FinanceStatementDocumentService,
  ) {}

  async listForStaff(
    actor: FinanceStatementActor,
    query: FinanceStatementListQuery,
  ) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const rows = await tx.financeStatement.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId: query.payerAccountId,
        },
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit);
      return {
        nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
        items: items.map(toFinanceStatementView),
      };
    });
  }

  async listForPayer(
    actor: FinanceStatementActor,
    payerAccountId: string,
    query: FinanceStatementListQuery,
  ) {
    await this.assertPayerAccess(actor, payerAccountId, "READ_STATEMENTS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const rows = await tx.financeStatement.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId,
        },
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit);
      return {
        nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
        items: items.map(toFinanceStatementView),
      };
    });
  }

  async requestForStaff(
    actor: FinanceStatementActor,
    idempotencyKey: string,
    input: FinanceStatementRequestInput,
  ) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    return this.request(
      actor,
      input.payerAccountId,
      idempotencyKey,
      input,
      false,
    );
  }

  async requestForPayer(
    actor: FinanceStatementActor,
    payerAccountId: string,
    idempotencyKey: string,
    input: Omit<FinanceStatementRequestInput, "payerAccountId">,
  ) {
    await this.assertPayerAccess(actor, payerAccountId, "READ_STATEMENTS");
    return this.request(
      actor,
      payerAccountId,
      idempotencyKey,
      { ...input, payerAccountId },
      true,
    );
  }

  async generateMonthEnd(actor: FinanceStatementActor, month: string) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    return this.generateMonthEndForScope(actor, month);
  }

  async generateMonthEndForAll(month: string) {
    const { periodEnd } = londonMonthPeriod(month);
    if (periodEnd.getTime() > Date.now()) {
      throw new ConflictException("The month-end period has not closed");
    }
    const scopes = await runTransaction(
      (tx) =>
        tx.$queryRaw<{ tenantId: string; orgId: string }[]>`
        SELECT "tenantId", "orgId" FROM app.list_finance_statement_scopes()
      `,
    );
    let organisationsProcessed = 0;
    let statementsReady = 0;
    for (const scope of scopes) {
      const actor: FinanceStatementActor = { ...scope, userId: null };
      if ((await this.access.resolveMode(actor)) === "LOCKED") continue;
      const result = await this.generateMonthEndForScope(actor, month);
      organisationsProcessed += 1;
      statementsReady += result.ready;
    }
    return { month, organisationsProcessed, statementsReady };
  }

  private async generateMonthEndForScope(
    actor: FinanceStatementActor,
    month: string,
  ) {
    const { periodStart, periodEnd } = londonMonthPeriod(month);
    if (periodEnd.getTime() > Date.now()) {
      throw new ConflictException("The month-end period has not closed");
    }
    const payerAccountIds = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financePayerAccount.findMany({
          where: { tenantId: actor.tenantId, orgId: actor.orgId },
          select: { id: true },
          orderBy: { id: "asc" },
        }),
    );
    const statements = [];
    for (const account of payerAccountIds) {
      const statement = await this.createStatement(
        actor,
        account.id,
        "MONTH_END",
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
        `MONTH_END:${hash(`${account.id}:${month}`)}`,
        false,
      );
      if (statement) {
        const ready = await this.documents.ensureReady(actor, statement.id);
        statements.push(toFinanceStatementView(ready));
      }
    }
    return { month, ready: statements.length, items: statements };
  }

  async getForStaff(actor: FinanceStatementActor, statementId: string) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    const statement = await this.loadStatement(actor, statementId);
    return toFinanceStatementView(statement);
  }

  async getForPayer(
    actor: FinanceStatementActor,
    payerAccountId: string,
    statementId: string,
  ) {
    await this.assertPayerAccess(actor, payerAccountId, "READ_STATEMENTS");
    const statement = await this.loadStatement(actor, statementId);
    if (statement.payerAccountId !== payerAccountId) {
      throw new NotFoundException("Finance statement not found");
    }
    return toFinanceStatementView(statement);
  }

  async downloadForStaff(actor: FinanceStatementActor, statementId: string) {
    await this.access.assertStaffAction(actor, "DOWNLOAD_DOCUMENT");
    return this.documents.download(actor, statementId);
  }

  async downloadForPayer(
    actor: FinanceStatementActor,
    payerAccountId: string,
    statementId: string,
  ) {
    await this.assertPayerAccess(actor, payerAccountId, "DOWNLOAD_DOCUMENT");
    return this.documents.download(actor, statementId, payerAccountId);
  }

  private async request(
    actor: FinanceStatementActor,
    payerAccountId: string,
    idempotencyKey: string,
    input: FinanceStatementRequestInput,
    isPayer: boolean,
  ) {
    if (!actor.userId) {
      throw new ForbiddenException("Finance statement requester unavailable");
    }
    if (isPayer) {
      await this.assertPayerAccess(actor, payerAccountId, "READ_STATEMENTS");
    } else {
      await this.access.assertStaffAction(actor, "READ_RECORDS");
    }
    const period = {
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
    };
    if (
      period.periodEnd <= period.periodStart ||
      period.periodEnd > new Date()
    ) {
      throw new ConflictException("Finance statement period is not valid");
    }
    const internalKey = `ON_DEMAND:${hash(`${actor.userId}:${idempotencyKey}`)}`;
    const statement = await this.createStatement(
      actor,
      payerAccountId,
      "ON_DEMAND",
      {
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
      },
      internalKey,
      isPayer,
    );
    if (!statement) throw new Error("On-demand statement was not created");
    const ready = await this.documents.ensureReady(
      actor,
      statement.id,
      isPayer ? payerAccountId : undefined,
    );
    return toFinanceStatementView(ready);
  }

  private async createStatement(
    actor: FinanceStatementActor,
    payerAccountId: string,
    kind: StatementKind,
    period: { periodStart: string; periodEnd: string },
    idempotencyKey: string,
    isPayer: boolean,
  ) {
    const generatedAt = new Date();
    const requestHash = hash(
      JSON.stringify({
        actorUserId: kind === "ON_DEMAND" ? actor.userId : null,
        kind,
        payerAccountId,
        period,
      }),
    );
    const existing = await this.findByKey(actor, idempotencyKey);
    if (existing) return this.assertIdempotentReplay(existing, requestHash);

    try {
      const created = await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          if (isPayer) {
            await this.assertPayerAccess(
              actor,
              payerAccountId,
              "READ_STATEMENTS",
            );
          } else {
            await this.access.assertStaffAction(actor, "READ_RECORDS");
          }
          const payerAccount = await tx.financePayerAccount.findFirst({
            where: {
              id: payerAccountId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            select: {
              id: true,
              financeProfileId: true,
              displayName: true,
            },
          });
          if (!payerAccount) {
            throw new NotFoundException("Finance payer account not found");
          }
          const profile = await tx.financeProfile.findFirst({
            where: {
              id: payerAccount.financeProfileId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            select: { legalEntityName: true, currency: true },
          });
          if (!profile)
            throw new NotFoundException("Finance profile not found");
          const snapshot = await buildFinanceStatementSnapshot(
            tx,
            this.balances,
            actor,
            {
              payerAccountId,
              payerName: payerAccount.displayName,
              legalEntityName: profile.legalEntityName,
              currency: profile.currency,
              periodStart: new Date(period.periodStart),
              periodEnd: new Date(period.periodEnd),
              generatedAt,
            },
          );
          if (
            kind === "MONTH_END" &&
            snapshot.lines.length === 0 &&
            snapshot.totals.closingBalanceMinor === "0" &&
            snapshot.totals.unappliedFundsMinor === "0" &&
            snapshot.totals.processingFundsMinor === "0"
          ) {
            return null;
          }
          return tx.financeStatement.create({
            data: {
              id: randomUUID(),
              financeProfileId: payerAccount.financeProfileId,
              payerAccountId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              kind,
              status: "GENERATING",
              periodStart: new Date(period.periodStart),
              periodEnd: new Date(period.periodEnd),
              generatedAt,
              ledgerCutoffAt: new Date(snapshot.ledgerCutoffAt),
              currency: profile.currency,
              openingBalanceMinor: BigInt(snapshot.totals.openingBalanceMinor),
              chargesIssuedMinor: BigInt(snapshot.totals.chargesIssuedMinor),
              creditsIssuedMinor: BigInt(snapshot.totals.creditsIssuedMinor),
              allocatedReceiptsMinor: BigInt(
                snapshot.totals.allocatedReceiptsMinor,
              ),
              reversalsMinor: BigInt(snapshot.totals.reversalsMinor),
              closingBalanceMinor: BigInt(snapshot.totals.closingBalanceMinor),
              unappliedFundsMinor: BigInt(snapshot.totals.unappliedFundsMinor),
              processingFundsMinor: BigInt(
                snapshot.totals.processingFundsMinor,
              ),
              snapshot,
              idempotencyKey,
              requestHash,
              requestedByUserId: kind === "ON_DEMAND" ? actor.userId : null,
            },
          });
        },
      );
      if (!created) return null;
      return created;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.findByKey(actor, idempotencyKey);
      if (!replay) throw error;
      return this.assertIdempotentReplay(replay, requestHash);
    }
  }

  private async findByKey(
    actor: FinanceStatementActor,
    idempotencyKey: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeStatement.findUnique({
        where: {
          tenantId_orgId_idempotencyKey: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            idempotencyKey,
          },
        },
      }),
    );
  }

  private assertIdempotentReplay<T extends { requestHash: string }>(
    statement: T,
    requestHash: string,
  ): T {
    if (statement.requestHash !== requestHash) {
      throw new ConflictException(
        "Idempotency-Key was already used for a different statement request",
      );
    }
    return statement;
  }

  private async loadStatement(
    actor: FinanceStatementActor,
    statementId: string,
  ) {
    const statement = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeStatement.findFirst({
          where: {
            id: statementId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
        }),
    );
    if (!statement) throw new NotFoundException("Finance statement not found");
    return statement;
  }

  private async assertPayerAccess(
    actor: FinanceStatementActor,
    payerAccountId: string,
    action: "READ_STATEMENTS" | "DOWNLOAD_DOCUMENT",
  ) {
    if (!actor.userId) {
      throw new ForbiddenException("Finance payer access unavailable");
    }
    await this.access.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      action,
    );
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
