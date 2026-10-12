import {
  BadRequestException,
  Body,
  Controller,
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
import { InstitutionalCensusService } from "./institutional-census.service";
import { InstitutionalQuoteService } from "./institutional-quote.service";

const planCodeSchema = z.enum([
  "INSTITUTIONAL_STARTER_MONTHLY",
  "INSTITUTIONAL_GROWTH_MONTHLY",
  "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
]);
const quoteSchema = z.object({
  planCode: planCodeSchema,
  includedModules: z.array(z.nativeEnum(Module)).default([]),
  paidModules: z.array(z.nativeEnum(Module)).default([]),
  declaredChildren: z.number().int().nonnegative().optional(),
  declarationAccepted: z.boolean().optional(),
});
const acceptSchema = z.object({
  snapshotId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

function parseBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  body: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "INVALID_REQUEST",
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

@IndependentTransaction()
@UseGuards(AuthUserGuard)
@Controller("billing/institutional")
export class InstitutionalBillingController {
  constructor(
    @Inject(InstitutionalQuoteService)
    private readonly quotes: InstitutionalQuoteService,
    @Inject(InstitutionalCensusService)
    private readonly census: InstitutionalCensusService,
  ) {}

  private async authorize(
    orgId: string,
    req: { authUserId?: string },
  ): Promise<string> {
    if (!req.authUserId)
      throw new UnauthorizedException("User context required.");
    await this.quotes.assertBillingRole(orgId, req.authUserId);
    return req.authUserId;
  }

  @Post("quotes")
  async createQuote(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: unknown,
  ) {
    const actorId = await this.authorize(orgId, req);
    return this.quotes.createQuote(
      orgId,
      actorId,
      parseBody(quoteSchema, body),
    );
  }

  @Post("quotes/accept")
  async acceptQuote(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: unknown,
  ) {
    const actorId = await this.authorize(orgId, req);
    const input = parseBody(acceptSchema, body);
    return this.quotes.acceptQuote(
      orgId,
      actorId,
      input.snapshotId,
      input.idempotencyKey,
    );
  }

  @Get("quotes/:id")
  async getQuote(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Param("id") id: string,
  ) {
    await this.authorize(orgId, req);
    return this.quotes.getQuote(orgId, id);
  }

  @Get("summary")
  async summary(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
  ) {
    await this.authorize(orgId, req);
    return this.census.summary(orgId);
  }
}
