import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { PermissionSlipVersionService } from "./permission-slip-version.service";
import { PermissionSlipDraftService } from "./permission-slip-draft.service";
import { TripsService } from "./trips.service";
import {
  cancelTripSchema,
  createSlipSchema,
  listTripsSchema,
  publishSlipSchema,
  reviseSlipSchema,
  scheduleSlipSchema,
  tripInputSchema,
  tripSlipIdSchema,
  updateSlipSchema,
} from "./trip-slip.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("school/sites/:siteId")
export class TripsController {
  constructor(
    @Inject(TripsService) private readonly trips: TripsService,
    @Inject(PermissionSlipVersionService)
    private readonly slips: PermissionSlipVersionService,
    @Inject(PermissionSlipDraftService)
    private readonly drafts: PermissionSlipDraftService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get("trips")
  @RequirePermission("school.trips.read")
  listTrips(@Param("siteId") siteId: string, @Query() query: unknown) {
    return this.trips.list(
      this.parse(listTripsSchema, query),
      this.actor(siteId),
    );
  }

  @Post("trips")
  @RequirePermission("school.trips.manage")
  createTrip(@Param("siteId") siteId: string, @Body() body: unknown) {
    return this.trips.create(
      this.parse(tripInputSchema, body),
      this.actor(siteId),
    );
  }

  @Get("trips/:tripId")
  @RequirePermission("school.trips.read")
  getTrip(@Param("siteId") siteId: string, @Param("tripId") tripId: string) {
    return this.trips.get(
      this.parse(tripSlipIdSchema, tripId),
      this.actor(siteId),
    );
  }

  @Patch("trips/:tripId")
  @RequirePermission("school.trips.manage")
  updateTrip(
    @Param("siteId") siteId: string,
    @Param("tripId") tripId: string,
    @Body() body: unknown,
  ) {
    return this.trips.update(
      this.parse(tripSlipIdSchema, tripId),
      this.parse(tripInputSchema, body),
      this.actor(siteId),
    );
  }

  @Post("trips/:tripId/cancel")
  @RequirePermission("school.trips.manage")
  cancelTrip(
    @Param("siteId") siteId: string,
    @Param("tripId") tripId: string,
    @Body() body: unknown,
  ) {
    return this.trips.cancel(
      this.parse(tripSlipIdSchema, tripId),
      this.parse(cancelTripSchema, body).reason,
      this.actor(siteId),
    );
  }

  @Get("permission-slips")
  @RequirePermission("school.permission_slips.read")
  listSlips(@Param("siteId") siteId: string, @Query() query: unknown) {
    return this.slips.list(
      this.parse(listTripsSchema, query),
      this.actor(siteId),
    );
  }

  @Post("permission-slips")
  @RequirePermission("school.permission_slips.manage")
  createSlip(@Param("siteId") siteId: string, @Body() body: unknown) {
    return this.drafts.create(
      this.parse(createSlipSchema, body),
      this.actor(siteId),
    );
  }

  @Get("permission-slips/:slipId")
  @RequirePermission("school.permission_slips.read")
  getSlip(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Query() query: unknown,
  ) {
    return this.slips.get(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(listTripsSchema, query),
      this.actor(siteId),
    );
  }

  @Patch("permission-slips/:slipId/draft")
  @RequirePermission("school.permission_slips.manage")
  updateDraft(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    return this.drafts.updateDraft(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(updateSlipSchema, body),
      this.actor(siteId),
    );
  }

  @Post("permission-slips/:slipId/revisions")
  @RequirePermission("school.permission_slips.manage")
  revise(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    return this.drafts.revise(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(reviseSlipSchema, body),
      this.actor(siteId),
    );
  }

  @Post("permission-slips/:slipId/publish")
  @RequirePermission("school.permission_slips.manage")
  publish(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    return this.slips.publish(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(publishSlipSchema, body).expectedVersionId,
      this.actor(siteId),
    );
  }

  @Post("permission-slips/:slipId/schedule")
  @RequirePermission("school.permission_slips.manage")
  schedule(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    const input = this.parse(scheduleSlipSchema, body);
    return this.slips.schedule(
      this.parse(tripSlipIdSchema, slipId),
      input.expectedVersionId,
      new Date(input.scheduledAt),
      this.actor(siteId),
    );
  }

  @Post("permission-slips/:slipId/cancel-schedule")
  @RequirePermission("school.permission_slips.manage")
  cancelSchedule(
    @Param("siteId") siteId: string,
    @Param("slipId") slipId: string,
    @Body() body: unknown,
  ) {
    return this.slips.cancelSchedule(
      this.parse(tripSlipIdSchema, slipId),
      this.parse(publishSlipSchema, body).expectedVersionId,
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
