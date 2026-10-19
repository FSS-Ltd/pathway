import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { z } from "zod";
import { FinanceAccessService } from "./access/finance-access.service";
import { MailerService } from "../mailer/mailer.service";

const financeStatementNoticeIntentSchema = z.object({
  eventType: z.literal("finance.statement.notice.requested"),
  aggregateType: z.literal("FINANCE_STATEMENT"),
  aggregateId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(255),
  payload: z.object({
    tenantId: z.string().min(1),
    orgId: z.string().min(1),
    statementId: z.string().uuid(),
    payerAccountId: z.string().uuid(),
    payerUserId: z.string().uuid(),
  }),
});

@Injectable()
export class FinanceStatementNoticeService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(MailerService)
    private readonly mailer: MailerService,
  ) {}

  async dispatch(unsafeIntent: unknown): Promise<{ sent: boolean }> {
    const parsed = financeStatementNoticeIntentSchema.safeParse(unsafeIntent);
    if (!parsed.success) {
      throw new BadRequestException("Invalid Finance statement notice intent");
    }
    const intent = parsed.data;
    const { payload } = intent;
    if (intent.aggregateId !== payload.statementId) {
      throw new BadRequestException(
        "Finance statement notice scope is invalid",
      );
    }
    if ((await this.access.resolveMode(payload)) === "LOCKED") {
      return { sent: false };
    }

    const delivery = await withTenantRlsContext(
      payload.tenantId,
      payload.orgId,
      async (tx) => {
        const [statement, grant, org] = await Promise.all([
          tx.financeStatement.findFirst({
            where: {
              id: payload.statementId,
              tenantId: payload.tenantId,
              orgId: payload.orgId,
              payerAccountId: payload.payerAccountId,
              kind: "MONTH_END",
              status: "READY",
            },
            select: {
              periodStart: true,
              periodEnd: true,
            },
          }),
          tx.financePayerGrant.findFirst({
            where: {
              financePayerAccountId: payload.payerAccountId,
              tenantId: payload.tenantId,
              orgId: payload.orgId,
              payerUserId: payload.payerUserId,
              revokedAt: null,
              payer: { isActive: true, email: { not: null } },
            },
            select: {
              payer: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  displayName: true,
                  firstName: true,
                },
              },
            },
          }),
          tx.org.findUnique({
            where: { id: payload.orgId },
            select: { name: true },
          }),
        ]);
        if (!statement || !grant || !org) return null;
        const email = grant.payer.email;
        if (!email) return null;
        return {
          statement,
          recipient: { ...grant.payer, email },
          organisationName: org.name,
        };
      },
    );
    if (!delivery) return { sent: false };

    const recipientName =
      delivery.recipient.displayName ??
      delivery.recipient.name ??
      delivery.recipient.firstName ??
      "Parent or guardian";
    await this.mailer.sendFinanceStatementNotice({
      to: delivery.recipient.email,
      recipientName,
      organisationName: delivery.organisationName,
      periodLabel: formatPeriod(
        delivery.statement.periodStart,
        delivery.statement.periodEnd,
      ),
      statementUrl: statementUrl(payload.statementId),
      statementId: payload.statementId,
      recipientUserId: delivery.recipient.id,
    });
    return { sent: true };
  }
}

function statementUrl(statementId: string): string {
  const base = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) throw new Error("Finance statement notice URL is not configured");
  const url = new URL(base);
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Finance statement notice URL must be a trusted HTTPS site URL",
    );
  }
  return new URL(`/family/finance/statements/${statementId}`, url).toString();
}

function formatPeriod(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
  const inclusiveEnd = new Date(end.getTime() - 1);
  const first = formatter.format(start);
  const last = formatter.format(inclusiveEnd);
  return first === last ? first : `${first} to ${last}`;
}
