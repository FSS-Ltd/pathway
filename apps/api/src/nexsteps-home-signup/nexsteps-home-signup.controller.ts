import { Body, Controller, Post } from "@nestjs/common";
import { NexstepsHomeSignupDto } from "./dto/nexsteps-home-signup.dto";
import { NexstepsHomeSignupService } from "./nexsteps-home-signup.service";

/**
 * Public (unauthenticated) household signup for NexSteps Home. Creates the
 * Auth0 user and the household's Org/Tenant/roles; the client logs in with
 * the same credentials afterwards through the existing Auth0 flow already
 * wired in apps/nexsteps-home - this endpoint issues no session itself.
 */
@Controller("public/nexsteps-home")
export class NexstepsHomeSignupController {
  constructor(private readonly signupService: NexstepsHomeSignupService) {}

  @Post("signup")
  async signup(
    @Body() body: NexstepsHomeSignupDto,
  ): Promise<{ success: true; orgId: string; tenantId: string }> {
    return this.signupService.signup(body);
  }
}
