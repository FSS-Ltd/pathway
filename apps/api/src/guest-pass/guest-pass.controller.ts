import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { GuestPassService, type GuestPassResult } from "./guest-pass.service";
import { CreateGuestPassDto } from "./dto/guest-pass.dto";

/**
 * Staff/kiosk quick-add: any authenticated staff member for the active site can
 * register a day-pass guest child. See docs/design/guest-pass-24h.md.
 */
@Controller("guest-pass")
@UseGuards(AuthUserGuard)
export class GuestPassController {
  constructor(
    @Inject(GuestPassService) private readonly guestPassService: GuestPassService,
  ) {}

  @Post("current")
  async createForCurrentSite(
    @CurrentTenant("tenantId") tenantId: string,
    @Body() body: CreateGuestPassDto,
  ): Promise<GuestPassResult> {
    return this.guestPassService.createForStaff(tenantId, body);
  }
}
