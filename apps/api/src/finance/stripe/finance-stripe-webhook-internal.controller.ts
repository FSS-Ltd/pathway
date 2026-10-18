import { timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { IndependentTransaction } from "../../common/database/independent-transaction.decorator";
import { FinanceStripeWebhookReplayService } from "./finance-stripe-webhook.service";

const replayBodySchema = z.object({
  tenantId: z.string().min(1).max(128),
  orgId: z.string().min(1).max(128),
  claimToken: z.string().uuid(),
});

function validInternalSecret(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_AUTH_SECRET;
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

@IndependentTransaction()
@Controller("internal/finance/stripe-webhooks")
export class FinanceStripeWebhookInternalController {
  constructor(
    @Inject(FinanceStripeWebhookReplayService)
    private readonly replay: FinanceStripeWebhookReplayService,
  ) {}

  @Post(":eventId/process")
  @HttpCode(200)
  async process(
    @Param("eventId") eventId: string,
    @Body() body: unknown,
    @Headers("x-pathway-internal-secret") secret?: string,
  ): Promise<{ status: "processed" | "deferred" }> {
    if (!validInternalSecret(secret)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    const parsed = replayBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    if (!eventId || eventId.length > 128) {
      throw new BadRequestException({ code: "INVALID_EVENT_ID" });
    }
    const status = await this.replay.processClaimedEvent({
      eventId,
      ...parsed.data,
    });
    return { status };
  }
}
