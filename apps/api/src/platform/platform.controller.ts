import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg } from "@pathway/auth";
import {
  getOrgCapabilities,
  VERTICAL_CAPABILITIES,
  type Capability,
} from "@pathway/platform";
import { isVertical } from "@pathway/types";
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

  @Get("verticals/:vertical/capabilities")
  verticalCapabilities(
    @Param("vertical") vertical: string,
  ): { capabilities: Capability[] } {
    if (!isVertical(vertical)) {
      throw new BadRequestException("Unknown vertical");
    }
    return { capabilities: VERTICAL_CAPABILITIES[vertical] };
  }
}
