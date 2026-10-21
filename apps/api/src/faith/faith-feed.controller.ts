import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { prisma } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { faithFeedQuerySchema, faithIdSchema } from "./faith.dto";
import { readFaithFeed } from "./faith-feed";

@UseGuards(AuthUserGuard)
@Controller("ace/faith/sites/:siteId/feed")
export class FaithFeedController {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get()
  async list(@Param("siteId") siteId: string, @Query() query: unknown) {
    const site = faithIdSchema.safeParse(siteId);
    const parsed = faithFeedQuerySchema.safeParse(query);
    if (!site.success || !parsed.success)
      throw new BadRequestException("Invalid Faith content request");
    const tenant = await prisma.tenant.findUnique({
      where: { id: site.data },
      select: { orgId: true },
    });
    if (!tenant) throw new NotFoundException("Faith content not found");
    const userId = this.context.requireContext().user.userId;
    const decision = await this.permissions.resolve({
      tenantId: site.data,
      orgId: tenant.orgId,
      userId,
      permission: "ace.faith.read",
      now: new Date(),
    });
    if (!decision.allowed)
      throw new NotFoundException("Faith content not found");
    return readFaithFeed(parsed.data, {
      tenantId: site.data,
      orgId: tenant.orgId,
      userId,
    });
  }
}
