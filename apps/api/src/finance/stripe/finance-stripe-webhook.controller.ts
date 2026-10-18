import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { FinanceStripeWebhookService } from "./finance-stripe-webhook.service";

interface FinanceStripeWebhookRequest {
  rawBody?: Buffer;
}

@Controller("finance/stripe/webhook")
export class FinanceStripeWebhookController {
  constructor(
    @Inject(FinanceStripeWebhookService)
    private readonly webhooks: FinanceStripeWebhookService,
  ) {}

  @Post()
  @HttpCode(200)
  receive(
    @Req() request: FinanceStripeWebhookRequest,
    @Headers("stripe-signature") signature?: string,
  ) {
    return this.webhooks.receive(request.rawBody, signature);
  }
}
