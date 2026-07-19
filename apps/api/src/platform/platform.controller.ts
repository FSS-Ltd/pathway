import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg } from "@pathway/auth";
import { Module, ModuleStatus, OrgRole, prisma } from "@pathway/db";
import {
  getOrgCapabilities,
  VERTICAL_CAPABILITIES,
  type Capability,
} from "@pathway/platform";
import { isVertical } from "@pathway/types";
import { AuthUserGuard } from "../auth/auth-user.guard";

interface AuthenticatedRequest {
  authUserId?: string;
}

type ModuleToggle = {
  module: Module;
  active: boolean;
};

export function isModule(value: unknown): value is Module {
  return (
    typeof value === "string" && Object.values(Module).includes(value as Module)
  );
}

function parseModuleToggle(body: unknown): ModuleToggle {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Invalid module toggle");
  }

  const candidate = body as Record<string, unknown>;
  if (!isModule(candidate.module)) {
    throw new BadRequestException("Unknown module");
  }
  if (typeof candidate.active !== "boolean") {
    throw new BadRequestException("active must be a boolean");
  }

  return {
    module: candidate.module,
    active: candidate.active,
  };
}

function getBillingSource(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const billingSource = (metadata as Record<string, unknown>).billingSource;
  return typeof billingSource === "string" ? billingSource : null;
}

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
  verticalCapabilities(@Param("vertical") vertical: string): {
    capabilities: Capability[];
  } {
    if (!isVertical(vertical)) {
      throw new BadRequestException("Unknown vertical");
    }
    return { capabilities: VERTICAL_CAPABILITIES[vertical] };
  }

  @Get("modules")
  async modules(@CurrentOrg("orgId") orgId: string) {
    const modules = await prisma.orgModule.findMany({
      where: { orgId },
      select: {
        module: true,
        status: true,
        activatedAt: true,
        expiresAt: true,
        metadata: true,
      },
    });

    return {
      modules: modules.map(({ metadata, ...module }) => ({
        ...module,
        billingSource: getBillingSource(metadata),
      })),
    };
  }

  @Post("modules/toggle")
  async toggleModule(
    @CurrentOrg("orgId") orgId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Module toggling is disabled in production");
    }

    await this.ensureOrgAdmin(req, orgId);
    const { module, active } = parseModuleToggle(body);
    const status = active ? ModuleStatus.ACTIVE : ModuleStatus.CANCELLED;

    return prisma.orgModule.upsert({
      where: { orgId_module: { orgId, module } },
      create: { orgId, module, status },
      update: { status },
    });
  }

  private async ensureOrgAdmin(
    req: AuthenticatedRequest,
    orgId: string,
  ): Promise<void> {
    const userId = req.authUserId;
    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }

    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId,
        orgId,
        role: { in: [OrgRole.ORG_ADMIN] },
      },
    });
    const orgRole = membership
      ? null
      : await prisma.userOrgRole.findFirst({
          where: {
            userId,
            orgId,
            role: { in: [OrgRole.ORG_ADMIN] },
          },
        });

    if (!membership && !orgRole) {
      throw new UnauthorizedException(
        "You must be an Organisation admin to toggle modules",
      );
    }
  }
}
