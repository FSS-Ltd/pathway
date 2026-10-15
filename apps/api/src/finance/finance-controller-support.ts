import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { financeIdempotencyKeySchema } from "./dto/finance-invoice.dto";

export interface FinanceRequestActor extends FinanceAccessScope {
  userId: string;
}

export function financeRequestActor(
  requestContext: PathwayRequestContext,
): FinanceRequestActor {
  const context = requestContext.getContext();
  const tenantId = context?.tenant.tenantId;
  const orgId = context?.org.orgId;
  const userId = context?.user.userId;
  if (!tenantId || !orgId || !userId) {
    throw new ForbiddenException("Finance access unavailable");
  }
  return { tenantId, orgId, userId };
}

export function parseFinanceInput<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data;
}

export function financeIdempotencyKey(value: string | undefined): string {
  return parseFinanceInput(financeIdempotencyKeySchema, value);
}
