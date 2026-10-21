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
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionSlipFamilyReadService } from "./permission-slip-family-read.service";
import { PermissionSlipStaffReadService } from "./permission-slip-staff-read.service";
import { listTripsSchema, tripSlipIdSchema } from "./trip-slip.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller()
export class PermissionSlipReadController {
  constructor(
    @Inject(PermissionSlipFamilyReadService)
    private readonly familyReads: PermissionSlipFamilyReadService,
    @Inject(PermissionSlipStaffReadService)
    private readonly staffReads: PermissionSlipStaffReadService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get("school/sites/:siteId/permission-slips/audience-options")
  @RequirePermission("school.permission_slips.read")
  audienceOptions(@Param("siteId") siteId: string) {
    return this.staffReads.audienceOptions(this.actor(siteId));
  }

  @Get("ace/family/sites/:siteId/children/:childId/permission-slips")
  @RequirePermission("school.permission_slips.read")
  listFamily(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
    @Query() query: unknown,
  ) {
    return this.familyReads.listFamily(
      this.parse(tripSlipIdSchema, childId),
      this.parse(listTripsSchema, query),
      this.actor(siteId),
    );
  }

  @Get("ace/family/sites/:siteId/children/:childId/permission-slips/:slipId")
  @RequirePermission("school.permission_slips.read")
  getFamily(
    @Param("siteId") siteId: string,
    @Param("childId") childId: string,
    @Param("slipId") slipId: string,
  ) {
    return this.familyReads.getFamily(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(tripSlipIdSchema, childId),
      this.actor(siteId),
    );
  }

  @Get("school/sites/:siteId/permission-slips/:slipId/responses")
  @RequirePermission("school.permission_slips.read")
  staffSummary(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
  ) {
    return this.staffReads.staffSummary(
      this.parse(tripSlipIdSchema, slipId),
      this.actor(siteId),
    );
  }

  private actor(siteId: string) {
    const expectedSiteId = this.parse(tripSlipIdSchema, siteId);
    const context = this.context.requireContext();
    if (context.tenant.tenantId !== expectedSiteId)
      throw new NotFoundException("School site not found");
    return {
      tenantId: expectedSiteId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
