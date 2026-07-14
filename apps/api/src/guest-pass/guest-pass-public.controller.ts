import { Body, Controller, Inject, Post } from "@nestjs/common";
import { GuestPassService, type GuestPassResult } from "./guest-pass.service";
import { PublicGuestPassSubmitDto } from "./dto/guest-pass.dto";

/**
 * Public (unauthenticated) self-serve guest pass, reusing the site's existing
 * public signup token. See docs/design/guest-pass-24h.md.
 */
@Controller("public/signup")
export class GuestPassPublicController {
  constructor(
    @Inject(GuestPassService) private readonly guestPassService: GuestPassService,
  ) {}

  @Post("submit-guest")
  async submitGuest(
    @Body() body: PublicGuestPassSubmitDto,
  ): Promise<GuestPassResult> {
    return this.guestPassService.createForSelfServe(body);
  }
}
