import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { paceRosterQuerySchema } from "./dto/pace-query.dto";
import { createPaceAssessmentSchema } from "./dto/create-pace-assessment.dto";
import {
  paceAssessmentCorrectionSchema,
  pacePolicyOverrideSchema,
} from "./dto/pace-correction.dto";
import { PaceCommandService } from "./pace-command.service";
import { PaceQueryService } from "./pace-query.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/pace")
export class PaceController {
  constructor(
    private readonly service: PaceQueryService,
    private readonly commandService: PaceCommandService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("roster")
  @RequirePermission("ace.pace.read")
  async roster(@Query() query: unknown) {
    try {
      return await this.service.listRoster(
        this.actor(),
        await paceRosterQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post("assessments")
  @RequirePermission("ace.pace.record")
  async recordAssessment(@Body() body: unknown) {
    try {
      return await this.commandService.record(
        await createPaceAssessmentSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post("assessments/:id/corrections")
  @RequirePermission("ace.pace.correct")
  async correctAssessment(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.commandService.correct(
        id,
        await paceAssessmentCorrectionSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post("policy-overrides")
  @RequirePermission("ace.pace.override")
  async authorisePolicyOverride(@Body() body: unknown) {
    try {
      return await this.commandService.override(
        await pacePolicyOverrideSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  private actor() {
    const context = this.requestContext.requireContext();
    const stepUp = stepUpFromSignedClaims(context.rawClaims);
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
      ...(stepUp ? { stepUp } : {}),
    };
  }
}

export function stepUpFromSignedClaims(
  claims: Record<string, unknown>,
): { authenticatedAt: string; secondFactor: true } | undefined {
  if (
    claims.provider === "clerk" &&
    typeof claims.issuedAt === "number" &&
    Array.isArray(claims.factorVerificationAgeMinutes)
  ) {
    const secondFactorAge = claims.factorVerificationAgeMinutes[1];
    if (
      typeof secondFactorAge === "number" &&
      Number.isInteger(secondFactorAge) &&
      secondFactorAge >= 0
    ) {
      return {
        authenticatedAt: new Date(
          (claims.issuedAt - secondFactorAge * 60) * 1_000,
        ).toISOString(),
        secondFactor: true,
      };
    }
  }

  if (
    claims.provider === "auth0" &&
    typeof claims.authenticationTime === "number" &&
    Array.isArray(claims.authenticationMethods) &&
    claims.authenticationMethods.some((method) => method === "mfa")
  ) {
    return {
      authenticatedAt: new Date(
        claims.authenticationTime * 1_000,
      ).toISOString(),
      secondFactor: true,
    };
  }
  return undefined;
}
