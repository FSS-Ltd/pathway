import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { createHash } from "node:crypto";
import { FinanceAccessService } from "./access/finance-access.service";
import { financeStatementStorageKey } from "../common/storage/storage-key.util";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { renderFinancePdf } from "./finance-document-pdf";
import { financeStatementSnapshotSchema } from "./finance-statement-snapshot-schema";
import type { FinanceStatementActor } from "./finance-statement.types";
import {
  financeStatementDateKey,
  toFinanceStatementPdfInput,
  type FinanceStatementRecord,
} from "./finance-statement-records";

@Injectable()
export class FinanceStatementDocumentService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(SupabaseStorageService)
    private readonly storage: SupabaseStorageService,
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async ensureReady(
    actor: FinanceStatementActor,
    statementId: string,
    payerAccountId?: string,
  ): Promise<FinanceStatementRecord> {
    await this.assertAccess(actor, payerAccountId, "READ");
    const statement = await this.loadStatement(
      actor,
      statementId,
      payerAccountId,
    );
    if (statement.status !== "READY") {
      const snapshot = financeStatementSnapshotSchema.parse(statement.snapshot);
      const document = await renderFinancePdf(
        toFinanceStatementPdfInput(snapshot),
      );
      const sha256 = createHash("sha256").update(document).digest("hex");
      const storageKey = financeStatementStorageKey(
        actor.tenantId,
        statement.id,
        sha256,
      );
      const stored = await this.storage.uploadObject({
        bucket: "private",
        key: storageKey,
        body: document,
        contentType: "application/pdf",
      });
      if (!stored) {
        throw new ServiceUnavailableException(
          "Finance statement storage is unavailable",
        );
      }
      await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
        tx.financeStatement.updateMany({
          where: {
            id: statement.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "GENERATING",
          },
          data: {
            status: "READY",
            documentStorageKey: storageKey,
            documentSha256: sha256,
            documentSizeBytes: document.byteLength,
            readyAt: new Date(),
          },
        }),
      );
    }
    await this.assertAccess(actor, payerAccountId, "READ");
    const ready = await this.loadStatement(actor, statementId, payerAccountId);
    if (ready.status !== "READY") {
      throw new ServiceUnavailableException(
        "Finance statement is still generating",
      );
    }
    await this.enqueueMonthlyNotices(actor, ready);
    return ready;
  }

  async download(
    actor: FinanceStatementActor,
    statementId: string,
    payerAccountId?: string,
  ) {
    const ready = await this.ensureReady(actor, statementId, payerAccountId);
    await this.assertAccess(actor, payerAccountId, "DOWNLOAD");
    const statement = await this.loadStatement(
      actor,
      statementId,
      payerAccountId,
    );
    if (
      statement.status !== "READY" ||
      !statement.documentStorageKey ||
      !statement.documentSha256 ||
      !statement.documentSizeBytes
    ) {
      throw new ServiceUnavailableException("Finance statement is unavailable");
    }
    const bucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim();
    if (!bucket) {
      throw new ServiceUnavailableException(
        "Finance statement storage is unavailable",
      );
    }
    const bytes = await this.storage.downloadObject(
      bucket,
      statement.documentStorageKey,
    );
    if (
      !bytes ||
      bytes.length !== statement.documentSizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !==
        statement.documentSha256
    ) {
      throw new ServiceUnavailableException(
        "Finance statement could not be verified or retrieved",
      );
    }
    await this.assertAccess(actor, payerAccountId, "DOWNLOAD");
    return {
      bytes,
      fileName: `statement-${financeStatementDateKey(ready.periodStart)}.pdf`,
    };
  }

  private async enqueueMonthlyNotices(
    actor: FinanceStatementActor,
    statement: FinanceStatementRecord,
  ): Promise<void> {
    if (statement.kind !== "MONTH_END") return;
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const grants = await tx.financePayerGrant.findMany({
        where: {
          financePayerAccountId: statement.payerAccountId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          revokedAt: null,
        },
        select: { payerUserId: true },
        orderBy: { payerUserId: "asc" },
      });
      for (const grant of grants) {
        await this.outbox.enqueue(tx, {
          aggregateType: "FINANCE_STATEMENT",
          aggregateId: statement.id,
          eventType: "finance.statement.notice.requested",
          payload: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            statementId: statement.id,
            payerAccountId: statement.payerAccountId,
            payerUserId: grant.payerUserId,
          },
          idempotencyKey: `finance-statement-notice:${statement.id}:${grant.payerUserId}`,
        });
      }
    });
  }

  private async loadStatement(
    actor: FinanceStatementActor,
    statementId: string,
    payerAccountId?: string,
  ): Promise<FinanceStatementRecord> {
    const statement = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeStatement.findFirst({
          where: {
            id: statementId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            ...(payerAccountId ? { payerAccountId } : {}),
          },
        }),
    );
    if (!statement) throw new NotFoundException("Finance statement not found");
    return statement;
  }

  private async assertAccess(
    actor: FinanceStatementActor,
    payerAccountId: string | undefined,
    action: "READ" | "DOWNLOAD",
  ): Promise<void> {
    if (payerAccountId) {
      if (!actor.userId) {
        throw new ForbiddenException("Finance payer access unavailable");
      }
      await this.access.assertPayerAction(
        actor,
        actor.userId,
        payerAccountId,
        action === "READ" ? "READ_STATEMENTS" : "DOWNLOAD_DOCUMENT",
      );
      return;
    }
    await this.access.assertStaffAction(
      actor,
      action === "READ" ? "READ_RECORDS" : "DOWNLOAD_DOCUMENT",
    );
  }
}
