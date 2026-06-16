import { Inject, Injectable, BadRequestException } from "@nestjs/common";
import {
  BillingWebhookProvider,
  type ParsedBillingWebhookEvent,
} from "../billing-webhook.provider";
import {
  BILLING_PROVIDER_CONFIG,
  type BillingProviderConfig,
} from "../billing-provider.config";
import { BillingProvider } from "@pathway/db";

@Injectable()
export class GoCardlessBillingWebhookProvider
  implements BillingWebhookProvider
{
  constructor(
    @Inject(BILLING_PROVIDER_CONFIG)
    private readonly config: BillingProviderConfig,
  ) {}

  async verifyAndParse(
    body: unknown,
    signature?: string,
  ): Promise<ParsedBillingWebhookEvent> {
    // TODO: implement GoCardless webhook signature verification (linear HMAC).
    if (!signature && process.env.NODE_ENV === "production") {
      throw new BadRequestException("Missing GoCardless signature");
    }

    const payload = typeof body === "string" ? safeParse(body) : body;
    if (!payload || typeof payload !== "object") {
      throw new BadRequestException("Invalid GoCardless payload");
    }

    // For now, map minimal fields; unknown events are ignored by controller.
    return {
      provider: BillingProvider.GOCARDLESS,
      eventId: String((payload as Record<string, unknown>).id ?? ""),
      kind: "unknown",
      orgId: "",
      subscriptionId: "",
    };
  }
}

const safeParse = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};
