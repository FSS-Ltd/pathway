import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceRequestActor } from "./finance-controller-support";
import type { FinanceFamilyInvoiceListQuery } from "./dto/finance-family.dto";
import {
  FinanceBalanceService,
  type FinanceInvoiceBalance,
} from "./finance-balance.service";

const FAMILY_FINANCE_READ_PERMISSIONS = [
  "finance.family_invoices.read",
  "finance.family_payments.pay",
  "finance.family_statements.read",
] as const satisfies readonly PermissionKey[];

const familyInvoiceSelect = {
  id: true,
  payerAccountId: true,
  invoiceNumber: true,
  status: true,
  currency: true,
  subtotalMinor: true,
  taxMinor: true,
  totalMinor: true,
  issuedAt: true,
  dueAt: true,
  createdAt: true,
  voidedAt: true,
  lines: {
    orderBy: { lineOrder: "asc" },
    select: {
      id: true,
      lineOrder: true,
      description: true,
      quantity: true,
      totalMinor: true,
    },
  },
} as const;

type FamilyInvoiceRecord = Prisma.FinanceInvoiceGetPayload<{
  select: typeof familyInvoiceSelect;
}>;

@Injectable()
export class FinanceFamilyService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async listPayerAccounts(actor: FinanceRequestActor) {
    await this.assertFamilyFinanceDirectoryAccess(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const grants = await tx.financePayerGrant.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerUserId: actor.userId,
          revokedAt: null,
        },
        orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
        select: {
          payerAccount: { select: { id: true, displayName: true } },
        },
      });
      const uniqueAccounts = new Map(
        grants.map(({ payerAccount }) => [payerAccount.id, payerAccount]),
      );
      return {
        items: Array.from(uniqueAccounts.values()).map((account) => ({
          id: account.id,
          displayName: account.displayName,
        })),
      };
    });
  }

  async listInvoices(
    actor: FinanceRequestActor,
    payerAccountId: string,
    query: FinanceFamilyInvoiceListQuery,
  ) {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "READ_ACCOUNT",
    );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const invoices = await tx.financeInvoice.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId,
          status: { in: ["ISSUED", "VOID"] },
        },
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: familyInvoiceSelect,
      });
      const hasMore = invoices.length > query.limit;
      const items = invoices.slice(0, query.limit);
      const balances = await this.balances.forInvoices(tx, actor, items);
      const activeAttempts = items.length
        ? await tx.financeCheckoutAttempt.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              invoiceId: { in: items.map(({ id }) => id) },
              status: { in: ["CREATING", "OPEN", "COMPLETED"] },
              payerGrant: {
                is: {
                  payerUserId: actor.userId,
                  financePayerAccountId: payerAccountId,
                  tenantId: actor.tenantId,
                  orgId: actor.orgId,
                  revokedAt: null,
                },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, invoiceId: true, status: true },
          })
        : [];
      const attemptByInvoice = new Map<
        string,
        (typeof activeAttempts)[number]
      >();
      for (const attempt of activeAttempts) {
        if (!attemptByInvoice.has(attempt.invoiceId)) {
          attemptByInvoice.set(attempt.invoiceId, attempt);
        }
      }

      return {
        nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
        items: items.map((invoice) =>
          toFamilyInvoiceView(
            invoice,
            balances.get(invoice.id),
            attemptByInvoice.get(invoice.id) ?? null,
          ),
        ),
      };
    });
  }

  async getInvoice(
    actor: FinanceRequestActor,
    payerAccountId: string,
    invoiceId: string,
  ) {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "READ_ACCOUNT",
    );
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const invoice = await tx.financeInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          payerAccountId,
          status: { in: ["ISSUED", "VOID"] },
        },
        select: familyInvoiceSelect,
      });
      if (!invoice) throw new NotFoundException("Finance invoice not found");
      const balances = await this.balances.forInvoices(tx, actor, [invoice]);
      const [attempt] = await tx.financeCheckoutAttempt.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId,
          status: { in: ["CREATING", "OPEN", "COMPLETED"] },
          payerGrant: {
            is: {
              payerUserId: actor.userId,
              financePayerAccountId: payerAccountId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              revokedAt: null,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, status: true },
      });
      return toFamilyInvoiceView(
        invoice,
        balances.get(invoice.id),
        attempt ?? null,
      );
    });
  }

  private async assertFamilyFinanceDirectoryAccess(
    actor: FinanceRequestActor,
  ): Promise<void> {
    if ((await this.financeAccess.resolveMode(actor)) === "LOCKED") {
      throw new ForbiddenException("Finance access unavailable");
    }
    const decisions = await Promise.all(
      FAMILY_FINANCE_READ_PERMISSIONS.map((permission) =>
        this.permissions.resolve({
          userId: actor.userId,
          orgId: actor.orgId,
          tenantId: actor.tenantId,
          permission,
          now: new Date(),
        }),
      ),
    );
    if (!decisions.some(({ allowed }) => allowed)) {
      throw new ForbiddenException("Finance access unavailable");
    }
  }
}

function toFamilyInvoiceView(
  invoice: FamilyInvoiceRecord,
  balance: FinanceInvoiceBalance | undefined,
  checkout: { id: string } | null,
) {
  if (!balance) {
    throw new Error("Finance invoice balance projection is missing");
  }
  return {
    id: invoice.id,
    payerAccountId: invoice.payerAccountId,
    invoiceNumber: invoice.invoiceNumber?.toString() ?? null,
    status: invoice.status,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor.toString(),
    taxMinor: invoice.taxMinor.toString(),
    totalMinor: invoice.totalMinor.toString(),
    balance,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueDate: invoice.dueAt ? dateOnly(invoice.dueAt) : null,
    createdAt: invoice.createdAt.toISOString(),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      lineOrder: line.lineOrder,
      description: line.description,
      quantity: line.quantity.toString(),
      totalMinor: line.totalMinor.toString(),
    })),
    checkout: checkout
      ? { attemptId: checkout.id, status: "PROCESSING" }
      : null,
  };
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
