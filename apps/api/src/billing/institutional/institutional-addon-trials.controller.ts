import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg } from "@pathway/auth";
import { Module } from "@pathway/db";
import { z } from "zod";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { IndependentTransaction } from "../../common/database/independent-transaction.decorator";
import { InstitutionalQuoteService } from "./institutional-quote.service";
import { DeclaredCapacityAddonTrialsService } from "./declared-capacity-addon-trials.service";

const moduleSchema = z.nativeEnum(Module);
const selectSchema = z.object({ module: moduleSchema });

function parseModule(value: unknown): Module {
  const parsed = moduleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({ code: "INVALID_ADDON_MODULE" });
  }
  return parsed.data;
}

@IndependentTransaction()
@UseGuards(AuthUserGuard)
@Controller("billing/institutional/addons/trials")
export class InstitutionalAddonTrialsController {
  constructor(
    @Inject(InstitutionalQuoteService)
    private readonly quotes: InstitutionalQuoteService,
    @Inject(DeclaredCapacityAddonTrialsService)
    private readonly trials: DeclaredCapacityAddonTrialsService,
  ) {}

  private async authorize(
    orgId: string,
    req: { authUserId?: string },
  ): Promise<string> {
    if (!req.authUserId) {
      throw new UnauthorizedException("User context required.");
    }
    await this.quotes.assertBillingRole(orgId, req.authUserId);
    return req.authUserId;
  }

  @Get()
  async list(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
  ) {
    await this.authorize(orgId, req);
    return this.trials.list(orgId);
  }

  @Post("select")
  async select(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: unknown,
  ) {
    await this.authorize(orgId, req);
    const parsed = selectSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    return this.trials.select(orgId, parsed.data.module);
  }

  @Delete(":module")
  async removeSelection(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Param("module") module: string,
  ) {
    await this.authorize(orgId, req);
    return this.trials.removeSelection(orgId, parseModule(module));
  }

  @Post(":module/activate")
  async activate(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Param("module") module: string,
  ) {
    const actorUserId = await this.authorize(orgId, req);
    return this.trials.activate(orgId, actorUserId, parseModule(module));
  }
}
