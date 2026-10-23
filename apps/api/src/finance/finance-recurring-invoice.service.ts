import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { calculateFinanceDocument } from "./domain/invoice-money";
import type { FinanceLineInput } from "./domain/invoice-money";
import type { FinanceRecurringInvoiceTemplateDraft } from "./dto/finance-recurring-invoice-template.dto";

export interface FinanceRecurringInvoiceActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceRecurringInvoiceService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
  ) {}

  async createTemplate(
    actor: FinanceRecurringInvoiceActor,
    draft: FinanceRecurringInvoiceTemplateDraft,
  ): Promise<{
    templateId: string;
    status: "ACTIVE";
    currency: string;
    nextPeriodStart: string;
  }> {
    await this.financeAccess.assertStaffAction(actor, "CREATE_INVOICE");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const profile = await tx.financeProfile.findUnique({
        where: {
          tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
        },
        select: { id: true, currency: true },
      });
      if (!profile) throw new NotFoundException("Finance profile not found");
      const payer = await tx.financePayerAccount.findFirst({
        where: {
          id: draft.payerAccountId,
          financeProfileId: profile.id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { id: true },
      });
      if (!payer)
        throw new NotFoundException("Finance payer account not found");

      const calculated = calculateFinanceDocument(draft.lines);
      if (calculated.totals.totalMinor <= 0n) {
        throw new ConflictException(
          "A recurring invoice must have a positive total",
        );
      }
      const template = await tx.financeRecurringInvoiceTemplate.create({
        data: {
          financeProfileId: profile.id,
          payerAccountId: payer.id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          currency: profile.currency,
          status: "ACTIVE",
          dayOfMonth: draft.dayOfMonth,
          dueDays: draft.dueDays,
          nextPeriodStart: dateOnlyAsUtc(draft.firstPeriodStart),
          createdByUserId: actor.userId,
          lines: {
            create: calculated.lines.map((line, lineOrder) => ({
              lineOrder,
              description: line.description,
              quantity: new Prisma.Decimal(line.quantity),
              unitAmountMinor: BigInt(line.unitAmountMinor),
              taxRateBasisPoints: line.taxRateBasisPoints,
            })),
          },
        },
        select: { id: true, currency: true, nextPeriodStart: true },
      });
      return {
        templateId: template.id,
        status: "ACTIVE",
        currency: template.currency,
        nextPeriodStart: template.nextPeriodStart.toISOString().slice(0, 10),
      };
    });
  }

  async setTemplateStatus(
    actor: FinanceRecurringInvoiceActor,
    templateId: string,
    nextStatus: "ACTIVE" | "PAUSED" | "CANCELLED",
  ): Promise<{
    templateId: string;
    status: "ACTIVE" | "PAUSED" | "CANCELLED";
  }> {
    await this.financeAccess.assertStaffAction(actor, "UPDATE_INVOICE");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "FinanceRecurringInvoiceTemplate"
        WHERE "id" = ${templateId}
          AND "tenantId" = ${actor.tenantId}
          AND "orgId" = ${actor.orgId}
        FOR UPDATE
      `;
      const current = await tx.financeRecurringInvoiceTemplate.findFirst({
        where: {
          id: templateId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
        },
        select: { id: true, status: true },
      });
      if (!current) {
        throw new NotFoundException(
          "Finance recurring invoice template not found",
        );
      }
      if (current.status === "CANCELLED" && nextStatus !== "CANCELLED") {
        throw new ConflictException(
          "A cancelled recurring invoice cannot be reopened",
        );
      }
      const template = await tx.financeRecurringInvoiceTemplate.update({
        where: { id: templateId },
        data: { status: nextStatus },
        select: { id: true, status: true },
      });
      return { templateId: template.id, status: template.status };
    });
  }

  async generateDueForScope(
    scope: FinanceAccessScope,
    asOf: Date,
  ): Promise<{ generated: number; invoiceIds: string[] }> {
    if ((await this.financeAccess.resolveMode(scope)) !== "ACTIVE") {
      return { generated: 0, invoiceIds: [] };
    }
    const asOfDate = londonDateOnly(asOf);
    const monthStart = `${asOfDate.slice(0, 7)}-01`;
    return withTenantRlsContext(scope.tenantId, scope.orgId, async (tx) => {
      const candidates = await tx.financeRecurringInvoiceTemplate.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          status: "ACTIVE",
          nextPeriodStart: { lte: dateOnlyAsUtc(monthStart) },
        },
        select: { id: true },
        orderBy: [{ nextPeriodStart: "asc" }, { id: "asc" }],
      });
      const invoiceIds: string[] = [];
      let generated = 0;
      for (const candidate of candidates) {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinanceRecurringInvoiceTemplate"
          WHERE "id" = ${candidate.id}
            AND "tenantId" = ${scope.tenantId}
            AND "orgId" = ${scope.orgId}
          FOR UPDATE
        `;
        const template = await tx.financeRecurringInvoiceTemplate.findFirst({
          where: {
            id: candidate.id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            financeProfileId: true,
            payerAccountId: true,
            tenantId: true,
            orgId: true,
            currency: true,
            dayOfMonth: true,
            dueDays: true,
            nextPeriodStart: true,
            createdByUserId: true,
            lines: {
              orderBy: { lineOrder: "asc" },
              select: {
                description: true,
                quantity: true,
                unitAmountMinor: true,
                taxRateBasisPoints: true,
              },
            },
          },
        });
        if (!template) continue;

        let periodStart = template.nextPeriodStart.toISOString().slice(0, 10);
        while (periodStart <= monthStart) {
          const issueOn = monthlyDate(periodStart, template.dayOfMonth);
          if (issueOn > asOfDate) break;
          const existing = await tx.financeInvoice.findUnique({
            where: {
              recurringTemplateId_recurringPeriodStart: {
                recurringTemplateId: template.id,
                recurringPeriodStart: dateOnlyAsUtc(periodStart),
              },
            },
            select: { id: true },
          });
          if (existing) {
            invoiceIds.push(existing.id);
          } else {
            const lineInputs: FinanceLineInput[] = template.lines.map(
              (line) => ({
                description: line.description,
                quantity: line.quantity.toString(),
                unitAmountMinor: line.unitAmountMinor.toString(),
                taxRateBasisPoints: line.taxRateBasisPoints,
              }),
            );
            const calculated = calculateFinanceDocument(lineInputs);
            const dueDate = addDays(issueOn, template.dueDays);
            const invoice = await tx.financeInvoice.create({
              data: {
                financeProfileId: template.financeProfileId,
                payerAccountId: template.payerAccountId,
                recurringTemplateId: template.id,
                recurringPeriodStart: dateOnlyAsUtc(periodStart),
                tenantId: template.tenantId,
                orgId: template.orgId,
                currency: template.currency,
                status: "DRAFT",
                createdByUserId: template.createdByUserId,
                dueAt: dateOnlyAsUtc(dueDate),
                subtotalMinor: calculated.totals.subtotalMinor,
                taxMinor: calculated.totals.taxMinor,
                totalMinor: calculated.totals.totalMinor,
                lines: {
                  create: calculated.lines.map((line, lineOrder) => ({
                    lineOrder,
                    description: line.description,
                    quantity: new Prisma.Decimal(line.quantity),
                    unitAmountMinor: BigInt(line.unitAmountMinor),
                    taxRateBasisPoints: line.taxRateBasisPoints,
                    netAmountMinor: line.netAmountMinor,
                    taxAmountMinor: line.taxAmountMinor,
                    totalMinor: line.totalMinor,
                  })),
                },
                events: {
                  create: {
                    actorUserId: template.createdByUserId,
                    type: "CREATED",
                  },
                },
              },
              select: { id: true },
            });
            invoiceIds.push(invoice.id);
            generated += 1;
          }
          const nextPeriodStart = nextMonth(periodStart);
          await tx.financeRecurringInvoiceTemplate.update({
            where: { id: template.id },
            data: { nextPeriodStart: dateOnlyAsUtc(nextPeriodStart) },
          });
          periodStart = nextPeriodStart;
        }
      }
      return { generated, invoiceIds };
    });
  }
}

function dateOnlyAsUtc(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Finance date is invalid");
  }
  return date;
}

function londonDateOnly(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthlyDate(periodStart: string, dayOfMonth: number): string {
  const [year, month] = periodStart.split("-").map(Number);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = new Date(
    Date.UTC(year, month - 1, Math.min(dayOfMonth, finalDay)),
  );
  return date.toISOString().slice(0, 10);
}

function nextMonth(periodStart: string): string {
  const [year, month] = periodStart.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function addDays(dateOnly: string, days: number): string {
  const date = dateOnlyAsUtc(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
