import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { FinanceBalanceService } from "./finance-balance.service";
import { lockInvoice } from "./finance-invoice-operations";
import {
  FINANCE_BACS_COLLECTION_TERMS_VERSION,
  FINANCE_BACS_MANDATE_CONSENT_VERSION,
} from "./domain/finance-collection-terms";
import {
  buildFinanceCollectionInstalments,
  splitFinanceInvoiceAmount,
} from "./domain/finance-collection-schedule";
import type { FinanceCollectionPlanDraft } from "./dto/finance-collection-plan.dto";
import {
  FINANCE_STRIPE_CHECKOUT_CONFIG,
  type FinanceStripeCheckoutConfig,
} from "./stripe/finance-stripe-checkout.config";

export interface FinanceCollectionPlanActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceCollectionPlanService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
    @Inject(FINANCE_STRIPE_CHECKOUT_CONFIG)
    private readonly stripeConfig: FinanceStripeCheckoutConfig,
  ) {}

  async create(
    actor: FinanceCollectionPlanActor,
    invoiceId: string,
    draft: FinanceCollectionPlanDraft,
  ): Promise<{ planId: string; status: "PENDING_REVIEW" }> {
    await this.financeAccess.assertStaffAction(actor, "SCHEDULE_DEBIT");
    if (this.stripeConfig.mode !== "test") {
      throw new ServiceUnavailableException(
        "Finance Bacs collection is available only in the test environment",
      );
    }
    validatePlanDraft(draft);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await lockInvoice(tx, actor, invoiceId);
      const invoice = await tx.financeInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId: draft.payerAccountId,
          status: "ISSUED",
        },
        select: {
          id: true,
          financeProfileId: true,
          payerAccountId: true,
          status: true,
          currency: true,
          totalMinor: true,
          issuedAt: true,
        },
      });
      if (!invoice || !invoice.payerAccountId || !invoice.issuedAt) {
        throw new NotFoundException("Issued Finance invoice not found");
      }
      if (invoice.currency !== "GBP") {
        throw new ConflictException(
          "Bacs collection is available for GBP invoices",
        );
      }
      try {
        splitFinanceInvoiceAmount(invoice.totalMinor, draft.instalmentCount);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : "Collection plan is invalid",
        );
      }

      const balance = await this.balances.forInvoices(tx, actor, [invoice]);
      const outstandingMinor = BigInt(
        balance.get(invoice.id)?.outstandingMinor ?? "0",
      );
      if (outstandingMinor <= 0n || outstandingMinor !== invoice.totalMinor) {
        throw new ConflictException(
          "A collection plan requires the full issued invoice balance",
        );
      }

      const existingPlan = await tx.financeCollectionPlan.findFirst({
        where: {
          invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: {
            in: [
              "PENDING_REVIEW",
              "PENDING_PAYER_ACCEPTANCE",
              "ACTIVE",
              "PAUSED",
            ],
          },
        },
        select: { id: true },
      });
      if (existingPlan) {
        throw new ConflictException(
          "An existing collection plan must be resolved first",
        );
      }

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceMandate"
        WHERE "id" = ${draft.mandateId}
          AND "payerAccountId" = ${invoice.payerAccountId}
          AND "tenantId" = ${actor.tenantId}
          AND "orgId" = ${actor.orgId}
        FOR UPDATE
      `;

      const [profile, mandate, connection] = await Promise.all([
        tx.financeProfile.findFirst({
          where: {
            id: invoice.financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { countryCode: true, currency: true },
        }),
        tx.financeMandate.findFirst({
          where: {
            id: draft.mandateId,
            payerAccountId: invoice.payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "ACTIVE",
            acceptedAt: { not: null },
            consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          },
          select: {
            id: true,
            stripeConnectionId: true,
            stripeAccountId: true,
            livemode: true,
          },
        }),
        tx.financeStripeConnection.findFirst({
          where: {
            financeProfileId: invoice.financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "READY",
            livemode: this.stripeConfig.mode === "live",
            stripeAccountId: { not: null },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, stripeAccountId: true, livemode: true },
        }),
      ]);
      if (
        profile?.countryCode !== "GB" ||
        profile.currency !== "GBP" ||
        !mandate ||
        !connection?.stripeAccountId ||
        mandate.stripeConnectionId !== connection.id ||
        mandate.stripeAccountId !== connection.stripeAccountId ||
        mandate.livemode !== connection.livemode
      ) {
        throw new ConflictException(
          "The payer's active Bacs mandate does not match the school account",
        );
      }

      const firstDueAt = dateOnlyAsUtc(draft.firstDueDate);
      const latestPlan = await tx.financeCollectionPlan.findFirst({
        where: {
          invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: { version: true },
      });
      const plan = await tx.financeCollectionPlan.create({
        data: {
          financeProfileId: invoice.financeProfileId,
          stripeConnectionId: connection.id,
          payerAccountId: invoice.payerAccountId,
          invoiceId,
          mandateId: mandate.id,
          version: (latestPlan?.version ?? 0) + 1,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "PENDING_REVIEW",
          amountMinor: outstandingMinor,
          currency: "GBP",
          instalmentCount: draft.instalmentCount,
          firstDueAt,
          dayOfMonth: Number(draft.firstDueDate.slice(8, 10)),
          consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
          createdByUserId: actor.userId,
        },
        select: { id: true },
      });
      await tx.financeCollectionPlanEvent.create({
        data: {
          planId: plan.id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          actorUserId: actor.userId,
          type: "CREATED",
          details: {
            invoiceId,
            amountMinor: outstandingMinor.toString(),
            instalmentCount: draft.instalmentCount,
            firstDueDate: draft.firstDueDate,
            consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
          },
        },
      });
      return { planId: plan.id, status: "PENDING_REVIEW" };
    });
  }

  async approve(
    actor: FinanceCollectionPlanActor,
    planId: string,
  ): Promise<{ planId: string; status: "PENDING_PAYER_ACCEPTANCE" }> {
    const plan = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        await this.lockPlan(tx, actor, planId);
        return tx.financeCollectionPlan.findFirst({
          where: { id: planId, tenantId: actor.tenantId, orgId: actor.orgId },
          select: {
            id: true,
            status: true,
            createdByUserId: true,
            consentVersion: true,
          },
        });
      },
    );
    if (!plan) throw new NotFoundException("Finance collection plan not found");
    await this.financeAccess.authorizeAutomatedDebitApproval(
      actor,
      plan.createdByUserId,
      actor.userId,
    );

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.lockPlan(tx, actor, planId);
      const updated = await tx.financeCollectionPlan.updateMany({
        where: {
          id: planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "PENDING_REVIEW",
          consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
        },
        data: {
          status: "PENDING_PAYER_ACCEPTANCE",
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "The collection plan changed or its consent terms are outdated",
        );
      }
      await tx.financeCollectionPlanEvent.create({
        data: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          actorUserId: actor.userId,
          type: "APPROVED",
        },
      });
      return { planId, status: "PENDING_PAYER_ACCEPTANCE" };
    });
  }

  async accept(
    actor: FinanceCollectionPlanActor,
    payerAccountId: string,
    planId: string,
  ): Promise<{ planId: string; status: "ACTIVE"; instalments: number }> {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "ACCEPT_COLLECTION_PLAN",
    );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.lockActivePayerGrant(tx, actor, payerAccountId);
      await this.lockPlan(tx, actor, planId);
      const plan = await tx.financeCollectionPlan.findFirst({
        where: {
          id: planId,
          payerAccountId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: {
          id: true,
          status: true,
          financeProfileId: true,
          invoiceId: true,
          mandateId: true,
          amountMinor: true,
          currency: true,
          instalmentCount: true,
          firstDueAt: true,
          consentVersion: true,
        },
      });
      if (!plan)
        throw new NotFoundException("Finance collection plan not found");
      if (
        plan.status === "ACTIVE" &&
        plan.consentVersion === FINANCE_BACS_COLLECTION_TERMS_VERSION
      ) {
        const count = await tx.financeCollectionInstalment.count({
          where: {
            planId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
        });
        return { planId, status: "ACTIVE", instalments: count };
      }
      if (
        plan.status !== "PENDING_PAYER_ACCEPTANCE" ||
        plan.consentVersion !== FINANCE_BACS_COLLECTION_TERMS_VERSION
      ) {
        throw new ConflictException(
          "This collection plan is no longer available for acceptance",
        );
      }

      const [invoice, mandate] = await Promise.all([
        tx.financeInvoice.findFirst({
          where: {
            id: plan.invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            payerAccountId,
            status: "ISSUED",
            currency: "GBP",
          },
          select: {
            id: true,
            status: true,
            totalMinor: true,
            issuedAt: true,
          },
        }),
        tx.financeMandate.findFirst({
          where: {
            id: plan.mandateId,
            payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "ACTIVE",
            acceptedAt: { not: null },
            consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          },
          select: { id: true },
        }),
      ]);
      if (!invoice || !invoice.issuedAt || !mandate) {
        throw new ConflictException(
          "The invoice or mandate is no longer eligible for collection",
        );
      }
      const balance = await this.balances.forInvoices(tx, actor, [invoice]);
      const outstandingMinor = BigInt(
        balance.get(invoice.id)?.outstandingMinor ?? "0",
      );
      if (outstandingMinor !== plan.amountMinor) {
        throw new ConflictException(
          "The invoice balance changed; request a new collection plan",
        );
      }
      let instalments;
      try {
        instalments = buildFinanceCollectionInstalments(
          plan.amountMinor,
          plan.instalmentCount,
          plan.firstDueAt.toISOString().slice(0, 10),
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : "Collection dates are invalid",
        );
      }

      await tx.financeCollectionPlan.update({
        where: { id: planId },
        data: {
          status: "ACTIVE",
          acceptedByUserId: actor.userId,
          acceptedAt: new Date(),
        },
      });
      await tx.financeCollectionInstalment.createMany({
        data: instalments.map((instalment) => ({
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          sequence: instalment.sequence,
          amountMinor: instalment.amountMinor,
          dueAt: instalment.dueAt,
        })),
      });
      await tx.financeCollectionPlanEvent.create({
        data: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          actorUserId: actor.userId,
          type: "ACCEPTED",
          details: {
            consentVersion: FINANCE_BACS_COLLECTION_TERMS_VERSION,
            instalments: instalments.map((instalment) => ({
              sequence: instalment.sequence,
              amountMinor: instalment.amountMinor.toString(),
              dueAt: instalment.dueAt.toISOString().slice(0, 10),
            })),
          },
        },
      });
      return { planId, status: "ACTIVE", instalments: instalments.length };
    });
  }

  async cancelByStaff(
    actor: FinanceCollectionPlanActor,
    planId: string,
  ): Promise<{ planId: string; status: "CANCELLED" }> {
    await this.financeAccess.assertStaffAction(actor, "CANCEL_COLLECTION_PLAN");
    return this.cancelInScope(actor, planId, null);
  }

  async resumeByStaff(
    actor: FinanceCollectionPlanActor,
    planId: string,
  ): Promise<{ planId: string; status: "ACTIVE" }> {
    await this.financeAccess.assertStaffAction(
      actor,
      "APPROVE_AUTOMATED_DEBIT",
    );
    if (this.stripeConfig.mode !== "test") {
      throw new ServiceUnavailableException(
        "Finance Bacs collection is available only in the test environment",
      );
    }
    const initial = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        return tx.financeCollectionPlan.findFirst({
          where: { id: planId, tenantId: actor.tenantId, orgId: actor.orgId },
          select: {
            id: true,
            status: true,
            invoiceId: true,
            payerAccountId: true,
            acceptedByUserId: true,
            createdByUserId: true,
            approvedByUserId: true,
          },
        });
      },
    );
    if (!initial)
      throw new NotFoundException("Finance collection plan not found");
    if (initial.status !== "PAUSED") {
      throw new ConflictException(
        "Only a paused collection plan can be resumed",
      );
    }
    await this.financeAccess.authorizeAutomatedDebitApproval(
      actor,
      initial.createdByUserId,
      actor.userId,
    );
    if (initial.approvedByUserId === actor.userId) {
      throw new ConflictException(
        "A different approver is required to resume collection",
      );
    }

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const payerGrants = initial.acceptedByUserId
        ? await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "FinancePayerGrant"
            WHERE "financePayerAccountId" = ${initial.payerAccountId}
              AND "payerUserId" = ${initial.acceptedByUserId}
              AND "tenantId" = ${actor.tenantId}
              AND "orgId" = ${actor.orgId}
              AND "revokedAt" IS NULL
            FOR UPDATE
          `
        : [];
      if (payerGrants.length !== 1) {
        throw new ConflictException("The payer grant has been revoked");
      }
      await lockInvoice(tx, actor, initial.invoiceId);
      await this.lockPlan(tx, actor, planId);
      const plan = await tx.financeCollectionPlan.findFirst({
        where: { id: planId, tenantId: actor.tenantId, orgId: actor.orgId },
        select: {
          id: true,
          status: true,
          invoiceId: true,
          payerAccountId: true,
          acceptedByUserId: true,
          amountMinor: true,
          currency: true,
          consentVersion: true,
          mandate: {
            select: {
              status: true,
              consentVersion: true,
              stripeConnectionId: true,
              stripeAccountId: true,
              livemode: true,
              stripeCustomer: {
                select: {
                  stripeAccountId: true,
                  stripeConnectionId: true,
                  payerAccountId: true,
                  livemode: true,
                },
              },
            },
          },
          stripeConnection: {
            select: {
              id: true,
              status: true,
              stripeAccountId: true,
              livemode: true,
            },
          },
        },
      });
      if (
        !plan ||
        plan.status !== "PAUSED" ||
        plan.invoiceId !== initial.invoiceId ||
        plan.payerAccountId !== initial.payerAccountId ||
        plan.acceptedByUserId !== initial.acceptedByUserId
      ) {
        throw new ConflictException(
          "The collection plan changed before approval",
        );
      }
      if (
        this.stripeConfig.mode !== "test" ||
        plan.currency !== "GBP" ||
        plan.consentVersion !== FINANCE_BACS_COLLECTION_TERMS_VERSION ||
        plan.mandate.status !== "ACTIVE" ||
        plan.mandate.consentVersion !== FINANCE_BACS_MANDATE_CONSENT_VERSION ||
        plan.mandate.livemode ||
        plan.mandate.stripeCustomer.stripeAccountId !==
          plan.stripeConnection.stripeAccountId ||
        plan.mandate.stripeCustomer.stripeConnectionId !==
          plan.stripeConnection.id ||
        plan.mandate.stripeCustomer.payerAccountId !== plan.payerAccountId ||
        plan.mandate.stripeCustomer.livemode ||
        plan.stripeConnection.status !== "READY" ||
        plan.stripeConnection.livemode ||
        plan.mandate.stripeConnectionId !== plan.stripeConnection.id ||
        plan.mandate.stripeAccountId !== plan.stripeConnection.stripeAccountId
      ) {
        throw new ConflictException(
          "The mandate or collection account is not eligible",
        );
      }
      const invoice = await tx.financeInvoice.findFirst({
        where: {
          id: plan.invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId: plan.payerAccountId,
          status: "ISSUED",
          currency: "GBP",
        },
        select: {
          id: true,
          status: true,
          totalMinor: true,
          issuedAt: true,
        },
      });
      if (!invoice?.issuedAt) {
        throw new ConflictException("The issued invoice is no longer eligible");
      }
      const failedAttempt = await tx.financeDebitAttempt.findFirst({
        where: {
          instalment: { is: { planId } },
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["FAILED", "CANCELLED"] },
        },
        select: { id: true },
      });
      if (failedAttempt) {
        throw new ConflictException(
          "A failed debit needs a new collection plan",
        );
      }
      const installments = await tx.financeCollectionInstalment.findMany({
        where: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: {
            in: ["SCHEDULED", "PAUSED", "SUBMISSION_PENDING", "PROCESSING"],
          },
        },
        select: { amountMinor: true },
      });
      const scheduledMinor = installments.reduce(
        (sum, item) => sum + item.amountMinor,
        0n,
      );
      const balance = await this.balances.forInvoices(tx, actor, [invoice]);
      const outstandingMinor = BigInt(
        balance.get(invoice.id)?.outstandingMinor ?? "0",
      );
      if (scheduledMinor <= 0n || outstandingMinor !== scheduledMinor) {
        throw new ConflictException(
          "The invoice balance changed; reconcile it before resuming",
        );
      }
      await tx.financeCollectionPlan.update({
        where: { id: planId },
        data: {
          status: "ACTIVE",
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
        },
      });
      await tx.financeCollectionInstalment.updateMany({
        where: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: "PAUSED",
        },
        data: { status: "SCHEDULED" },
      });
      await tx.financeCollectionPlanEvent.create({
        data: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          actorUserId: actor.userId,
          type: "RESUMED",
          details: { reason: "INDEPENDENT_STAFF_APPROVAL" },
        },
      });
      return { planId, status: "ACTIVE" };
    });
  }

  async cancelByPayer(
    actor: FinanceCollectionPlanActor,
    payerAccountId: string,
    planId: string,
  ): Promise<{ planId: string; status: "CANCELLED" }> {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "CANCEL_COLLECTION_PLAN",
    );
    return this.cancelInScope(actor, planId, payerAccountId);
  }

  private async cancelInScope(
    actor: FinanceCollectionPlanActor,
    planId: string,
    payerAccountId: string | null,
  ): Promise<{ planId: string; status: "CANCELLED" }> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      if (payerAccountId) {
        await this.lockActivePayerGrant(tx, actor, payerAccountId);
      }
      await this.lockPlan(tx, actor, planId);
      const plan = await tx.financeCollectionPlan.findFirst({
        where: {
          id: planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          ...(payerAccountId ? { payerAccountId } : {}),
        },
        select: { id: true, status: true },
      });
      if (!plan)
        throw new NotFoundException("Finance collection plan not found");
      if (plan.status === "CANCELLED") return { planId, status: "CANCELLED" };
      if (plan.status === "COMPLETED") {
        throw new ConflictException(
          "A completed collection plan cannot be cancelled",
        );
      }
      await tx.financeCollectionPlan.update({
        where: { id: planId },
        data: { status: "CANCELLED" },
      });
      await tx.financeCollectionInstalment.updateMany({
        where: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: { in: ["SCHEDULED", "PAUSED"] },
        },
        data: { status: "CANCELLED" },
      });
      await tx.financeCollectionPlanEvent.create({
        data: {
          planId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          actorUserId: actor.userId,
          type: "CANCELLED",
          details: { source: payerAccountId ? "PAYER" : "STAFF" },
        },
      });
      return { planId, status: "CANCELLED" };
    });
  }

  private async lockPlan(
    tx: Prisma.TransactionClient,
    actor: FinanceCollectionPlanActor,
    planId: string,
  ): Promise<void> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinanceCollectionPlan"
      WHERE "id" = ${planId}
        AND "tenantId" = ${actor.tenantId}
        AND "orgId" = ${actor.orgId}
      FOR UPDATE
    `;
  }

  private async lockActivePayerGrant(
    tx: Prisma.TransactionClient,
    actor: FinanceCollectionPlanActor,
    payerAccountId: string,
  ): Promise<void> {
    const grants = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancePayerGrant"
      WHERE "financePayerAccountId" = ${payerAccountId}
        AND "payerUserId" = ${actor.userId}
        AND "tenantId" = ${actor.tenantId}
        AND "orgId" = ${actor.orgId}
        AND "revokedAt" IS NULL
      FOR UPDATE
    `;
    if (grants.length !== 1) {
      throw new ForbiddenException("Finance access unavailable");
    }
  }
}

function validatePlanDraft(draft: FinanceCollectionPlanDraft): void {
  try {
    splitFinanceInvoiceAmount(12_000n, draft.instalmentCount);
    dateOnlyAsUtc(draft.firstDueDate);
    buildFinanceCollectionInstalments(
      12_000n,
      draft.instalmentCount,
      draft.firstDueDate,
    );
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : "Collection plan is invalid",
    );
  }
}

function dateOnlyAsUtc(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("Collection date must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException("Collection date is invalid");
  }
  return date;
}
