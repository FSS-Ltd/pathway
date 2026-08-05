import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { PublicSignupService } from "./public-signup.service";
import { PublicSignupConfigDto } from "./dto/public-signup-config.dto";
import {
  PublicSignupContactOnlySubmitDto,
  PublicSignupSubmitDto,
  SubmitExistingUserDto,
} from "./dto/public-signup-submit.dto";
import { SignupPreflightDto } from "./dto/signup-preflight.dto";
import { VerifiedPrincipalGuard, getVerifiedPrincipal } from "../auth/verified-principal.guard";

/**
 * Public (unauthenticated) endpoints for invite-only parent signup.
 * All routes validate a token from the QR/signup link; tenant is derived server-side.
 * Child photos are sent as base64 in the submit payload and stored as bytes in DB for now.
 */
@Controller("public")
export class PublicSignupController {
  constructor(
    @Inject(PublicSignupService) private readonly publicSignupService: PublicSignupService,
  ) {}

  @Get("signup/config")
  async getConfig(
    @Query("token") token: string | undefined,
  ): Promise<PublicSignupConfigDto> {
    if (!token?.trim()) {
      throw new BadRequestException("Token is required");
    }
    return this.publicSignupService.getConfig(token.trim());
  }

  @Post("signup/preflight")
  async preflight(@Body() body: SignupPreflightDto): Promise<{
    email: string;
    userExists: boolean;
    mode: "EXISTING_USER" | "NEW_USER";
  }> {
    return this.publicSignupService.signupPreflight(
      body.inviteToken,
      body.email,
    );
  }

  @Post("signup/submit")
  async submit(@Body() body: PublicSignupSubmitDto): Promise<{ success: true; message: string }> {
    return this.publicSignupService.submit(body);
  }

  @Post("signup/submit-contact-only")
  async submitContactOnly(
    @Body() body: PublicSignupContactOnlySubmitDto,
  ): Promise<{ success: true; message: string }> {
    return this.publicSignupService.submitContactOnly(body);
  }

  @Post("signup/submit-existing-user")
  @UseGuards(VerifiedPrincipalGuard)
  async submitExistingUser(
    @Body() body: SubmitExistingUserDto,
    @Req() req: Request,
  ): Promise<{ success: true; message: string }> {
    return this.publicSignupService.submitExistingUser(body, getVerifiedPrincipal(req));
  }
}
