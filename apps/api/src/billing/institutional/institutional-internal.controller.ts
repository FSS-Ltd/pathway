import { timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { IndependentTransaction } from "../../common/database/independent-transaction.decorator";
import { InstitutionalOperationService } from "./institutional-operation.service";
import { DeclaredCapacityAddonTrialExpiryService } from "./declared-capacity-addon-trial-expiry.service";

const expiryOrgSchema = z.object({ orgId: z.string().min(1).max(128) });
const expiryEmailEventSchema = z.object({
  eventType: z.literal("institutional.addon_trial.expired"),
  aggregateType: z.literal("institutional_addon_trial"),
  aggregateId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(256),
  payload: z.object({
    orgId: z.string().min(1).max(128),
    trialId: z.string().min(1).max(128),
  }),
});

function validInternalSecret(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_AUTH_SECRET;
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

@IndependentTransaction()
@Controller("billing/institutional/internal")
export class InstitutionalBillingInternalController {
  constructor(
    @Inject(InstitutionalOperationService)
    private readonly operations: InstitutionalOperationService,
    @Inject(DeclaredCapacityAddonTrialExpiryService)
    private readonly addonTrialExpiry: DeclaredCapacityAddonTrialExpiryService,
  ) {}

  @Post("operations/:id")
  async execute(
    @Param("id") id: string,
    @Headers("x-pathway-internal-secret") secret?: string,
  ): Promise<{ status: "ok" }> {
    if (!validInternalSecret(secret)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    await this.operations.execute(id);
    return { status: "ok" };
  }

  @Post("addons/expire")
  async expireAddonTrials(
    @Body() body: unknown,
    @Headers("x-pathway-internal-secret") secret?: string,
  ): Promise<{ expired: number }> {
    if (!validInternalSecret(secret)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    const parsed = expiryOrgSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    return this.addonTrialExpiry.expireDueForOrg(parsed.data.orgId);
  }

  @Post("addons/expiry-email")
  async dispatchAddonTrialExpiryEmail(
    @Body() body: unknown,
    @Headers("x-pathway-internal-secret") secret?: string,
  ): Promise<{ sent: boolean }> {
    if (!validInternalSecret(secret)) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    const parsed = expiryEmailEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    const { aggregateId, idempotencyKey, payload } = parsed.data;
    if (aggregateId !== payload.trialId) {
      throw new BadRequestException({ code: "INVALID_OUTBOX_EVENT" });
    }
    return this.addonTrialExpiry.dispatchExpiryEmail(
      payload.orgId,
      payload.trialId,
      idempotencyKey,
    );
  }
}
