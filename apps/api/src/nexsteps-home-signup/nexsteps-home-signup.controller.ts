import { Controller, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { VerifiedPrincipalGuard, getVerifiedPrincipal } from "../auth/verified-principal.guard";
import { NexstepsHomeSignupService } from "./nexsteps-home-signup.service";

/**
 * Household signup for NexSteps Home. The client authenticates with Clerk
 * first (useSignUp() + email verification) and calls this endpoint with
 * that session's bearer token; this endpoint provisions the household's
 * Org/Tenant/roles for the already-verified principal. Uses
 * VerifiedPrincipalGuard rather than AuthUserGuard - the latter would
 * JIT-provision a bare User and race the provisioning transaction below.
 */
@Controller("public/nexsteps-home")
export class NexstepsHomeSignupController {
  constructor(private readonly signupService: NexstepsHomeSignupService) {}

  @Post("signup")
  @UseGuards(VerifiedPrincipalGuard)
  async signup(
    @Req() req: Request,
  ): Promise<{ success: true; orgId: string; tenantId: string }> {
    return this.signupService.signup(getVerifiedPrincipal(req));
  }
}
