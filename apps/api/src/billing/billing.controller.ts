import { BadRequestException, Body, Controller, Post, Get, Inject, UseGuards, forwardRef } from "@nestjs/common";
import { z } from "zod";
import { BillingService } from "./billing.service";
import { checkoutDto } from "./dto/checkout.dto";
import { EntitlementsService } from "./entitlements.service";
import { EntitlementsEnforcementService } from "./entitlements-enforcement.service";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { CurrentOrg } from "@pathway/auth";

const parseOrBadRequest = async <T>(
  schema: z.ZodTypeAny,
  data: unknown,
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const flat = e.flatten();
      const fieldMessages = Object.entries(flat.fieldErrors).flatMap(
        ([key, msgs]) => (msgs ?? []).map((m) => `${key}: ${m}`),
      );
      const formMessages = flat.formErrors ?? [];
      const messages = [...formMessages, ...fieldMessages];
      throw new BadRequestException(
        messages.length ? messages : ["Invalid request body"],
      );
    }
    throw e;
  }
};

@Controller("billing")
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly service: BillingService,
    @Inject(forwardRef(() => EntitlementsService)) private readonly entitlements: EntitlementsService,
    @Inject(forwardRef(() => EntitlementsEnforcementService)) private readonly enforcement: EntitlementsEnforcementService,
  ) {}

  @Post("checkout")
  async checkout(@Body() body: unknown) {
    const dto = await parseOrBadRequest<z.infer<typeof checkoutDto>>(
      checkoutDto,
      body,
    );
    return this.service.checkout(dto);
  }

  @Get("entitlements")
  @UseGuards(AuthUserGuard)
  async getEntitlements(@CurrentOrg("orgId") orgId: string) {
    const resolved = await this.entitlements.resolve(orgId);
    const av30Status = await this.enforcement.checkAv30ForOrg(orgId);

    return {
      orgId: resolved.orgId,
      isMasterOrg: resolved.isMasterOrg,
      subscriptionStatus: resolved.subscriptionStatus,
      subscription: resolved.subscription ? {
        planCode: resolved.subscription.planCode,
        status: resolved.subscription.status,
        periodStart: resolved.subscription.periodStart.toISOString(),
        periodEnd: resolved.subscription.periodEnd.toISOString(),
        cancelAtPeriodEnd: resolved.subscription.cancelAtPeriodEnd,
      } : null,
      av30Cap: resolved.av30Cap,
      maxChildren: resolved.maxChildren,
      currentAv30: resolved.currentAv30,
      av30Enforcement: {
        status: av30Status.status,
        graceUntil: av30Status.graceUntil?.toISOString() ?? null,
        messageCode: av30Status.messageCode,
      },
      storageGbCap: resolved.storageGbCap,
      storageGbUsage: resolved.storageGbUsage,
      smsMessagesCap: resolved.smsMessagesCap,
      smsMonthUsage: resolved.smsMonthUsage,
      leaderSeatsIncluded: resolved.leaderSeatsIncluded,
      maxSites: resolved.maxSites,
      usageCalculatedAt: resolved.usageCalculatedAt?.toISOString() ?? null,
    };
  }
}
