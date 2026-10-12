import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg, CurrentTenant } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { EnrolmentIdentitiesService } from "./enrolment-identities.service";
import { EnrolmentRollService } from "./enrolment-roll.service";
import { enrolmentPeriodSchema } from "./enrolment-periods";

const identitySchema = z.object({
  localReference: z.string().trim().min(1).max(80),
  childId: z.string().uuid(),
});
const linkSchema = z.object({ childId: z.string().uuid() });
const changeSchema = z.object({
  action: z.enum(["admit", "leave", "reenrol", "correct"]),
  date: z.string().optional(),
  periods: z.array(enrolmentPeriodSchema).optional(),
  reason: z.string().trim().min(1).max(500),
});
const confirmationSchema = z.object({
  effectiveOn: z.string(),
  acknowledgeEmpty: z.boolean().default(false),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return parsed.data;
}

@IndependentTransaction()
@UseGuards(AuthUserGuard)
@Controller("enrolments")
export class EnrolmentsController {
  constructor(
    @Inject(EnrolmentIdentitiesService)
    private readonly identities: EnrolmentIdentitiesService,
    @Inject(EnrolmentRollService)
    private readonly roll: EnrolmentRollService,
  ) {}

  private async authorize(
    orgId: string,
    req: { authUserId?: string },
  ): Promise<string> {
    if (!req.authUserId)
      throw new UnauthorizedException("User context required.");
    await this.identities.assertOrgAdmin(orgId, req.authUserId);
    return req.authUserId;
  }

  @Get("candidates")
  async candidates(
    @CurrentOrg("orgId") orgId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: { authUserId?: string },
  ) {
    await this.authorize(orgId, req);
    return this.identities.candidates(orgId, tenantId);
  }

  @Post("identities")
  async createIdentity(
    @CurrentOrg("orgId") orgId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: { authUserId?: string },
    @Body() body: unknown,
  ) {
    await this.authorize(orgId, req);
    const input = parseBody(identitySchema, body);
    return this.identities.createIdentity(
      orgId,
      tenantId,
      input.localReference,
      input.childId,
    );
  }

  @Post("identities/:id/sites")
  async linkProfile(
    @CurrentOrg("orgId") orgId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: { authUserId?: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    await this.authorize(orgId, req);
    const input = parseBody(linkSchema, body);
    return this.identities.linkProfile(orgId, tenantId, id, input.childId);
  }

  @Post("identities/:id/revisions")
  async recordChange(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actorId = await this.authorize(orgId, req);
    const input = parseBody(changeSchema, body);
    return this.roll.recordChange(
      orgId,
      id,
      actorId,
      input.action,
      input.date,
      input.periods,
      input.reason,
    );
  }

  @Post("roll/confirm")
  async confirmRoll(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: unknown,
  ) {
    const actorId = await this.authorize(orgId, req);
    const input = parseBody(confirmationSchema, body);
    return this.roll.confirmRoll(
      orgId,
      actorId,
      input.effectiveOn,
      Boolean(input.acknowledgeEmpty),
    );
  }

  @Get("roll")
  async currentRoll(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Query("effectiveOn") effectiveOn: string,
  ) {
    await this.authorize(orgId, req);
    return this.roll.roll(orgId, effectiveOn);
  }

  @Get("roll/latest-confirmation")
  async latestConfirmation(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
  ) {
    await this.authorize(orgId, req);
    return this.roll.latestConfirmation(orgId);
  }
}
