import { INSTITUTIONAL_VERTICALS } from "@pathway/types";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
} from "@nestjs/common";
import { Module } from "@pathway/db";
import { z } from "zod";
import { InstitutionalPublicCheckoutService } from "./institutional-public-checkout.service";

const checkoutSchema = z.object({
  planCode: z.enum([
    "INSTITUTIONAL_STARTER_MONTHLY",
    "INSTITUTIONAL_STARTER_YEARLY",
    "INSTITUTIONAL_GROWTH_MONTHLY",
    "INSTITUTIONAL_GROWTH_YEARLY",
    "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
    "INSTITUTIONAL_PROFESSIONAL_YEARLY",
  ]),
  enrolledChildren: z.number().int().nonnegative().safe(),
  declarationAccepted: z.literal(true),
  setting: z.enum(INSTITUTIONAL_VERTICALS),
  storageChoice: z.enum(["none", "100", "200", "1000"]),
  includedModules: z.array(z.nativeEnum(Module)).default([]),
  paidModules: z.array(z.nativeEnum(Module)).default([]),
  idempotencyKey: z.string().min(8).max(128),
  org: z.object({
    orgName: z.string().trim().min(2).max(120),
    contactName: z.string().trim().min(2).max(120),
    contactEmail: z.string().email().max(254),
    password: z.string().min(8).max(200),
  }),
});

const declaredCapacityCheckoutSchema = z.object({
  declaredCapacity: z.number().int().nonnegative().safe(),
  interval: z.enum(["month", "year"]),
  expectedTotalPence: z.number().int().nonnegative().safe(),
  declarationAccepted: z.literal(true),
  setting: z.enum(INSTITUTIONAL_VERTICALS),
  payNowModules: z.array(z.nativeEnum(Module)).default([]),
  trialModules: z.array(z.nativeEnum(Module)).default([]),
  idempotencyKey: z.string().min(8).max(128),
  org: z.object({
    orgName: z.string().trim().min(2).max(120),
    contactName: z.string().trim().min(2).max(120),
    contactEmail: z.string().email().max(254),
    password: z.string().min(8).max(200),
  }),
});

@Controller("billing/institutional/public")
export class InstitutionalPublicCheckoutController {
  constructor(
    @Inject(InstitutionalPublicCheckoutService)
    private readonly checkoutService: InstitutionalPublicCheckoutService,
  ) {}

  @Post("checkout")
  checkout(@Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    return this.checkoutService.checkout(parsed.data);
  }

  @Post("declared-capacity/checkout")
  checkoutDeclaredCapacity(@Body() body: unknown) {
    const parsed = declaredCapacityCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        details: parsed.error.flatten(),
      });
    }
    return this.checkoutService.checkoutDeclaredCapacity(parsed.data);
  }
}
