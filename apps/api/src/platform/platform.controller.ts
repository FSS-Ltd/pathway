import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentOrg } from "@pathway/auth";
import { getOrgCapabilities, type Capability } from "@pathway/platform";
import { AuthUserGuard } from "../auth/auth-user.guard";

@UseGuards(AuthUserGuard)
@Controller("platform")
export class PlatformController {
  @Get("capabilities")
  async capabilities(
    @CurrentOrg("orgId") orgId: string,
  ): Promise<{ capabilities: Capability[] }> {
    return { capabilities: await getOrgCapabilities(orgId) };
  }
}
