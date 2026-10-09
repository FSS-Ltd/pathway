import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentOrg,
  CurrentTenant,
  PathwayRequestContext,
} from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import {
  parseVolunteeringInput,
  saveSchoolVolunteeringSchema,
  staffVolunteeringRangeSchema,
} from "./dto/school-volunteering.dto";
import { rotaActorFromRequest } from "./rota-access.service";
import { SchoolVolunteeringService } from "./school-volunteering.service";

const idSchema = z.string().uuid();
const cancelSchema = z
  .object({ reason: z.string().trim().min(3).max(240) })
  .strict();

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/volunteering")
export class ParentSchoolVolunteeringController {
  constructor(
    @Inject(SchoolVolunteeringService)
    private readonly service: SchoolVolunteeringService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string) {
    return this.service.parentCalendar(
      parseVolunteeringInput(idSchema, siteId),
      this.requestContext.requireContext().user.userId,
    );
  }

  @Put("periods/:periodId")
  save(
    @Param("siteId") siteId: string,
    @Param("periodId") periodId: string,
    @Body() body: unknown,
  ) {
    return this.service.saveParentChoices(
      parseVolunteeringInput(idSchema, siteId),
      parseVolunteeringInput(idSchema, periodId),
      this.requestContext.requireContext().user.userId,
      parseVolunteeringInput(saveSchoolVolunteeringSchema, body),
    );
  }
}

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/staff/sites/:siteId/volunteering")
export class StaffSchoolVolunteeringController {
  constructor(
    @Inject(SchoolVolunteeringService)
    private readonly service: SchoolVolunteeringService,
  ) {}

  @Get()
  list(
    @Param("siteId") rawSiteId: string,
    @Query() query: unknown,
    @CurrentTenant("tenantId") activeSiteId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req()
    request: Request & { authUserId?: string; authIsSuperUser?: boolean },
  ) {
    const siteId = parseVolunteeringInput(idSchema, rawSiteId);
    if (siteId !== activeSiteId) {
      throw new NotFoundException("School volunteering not found");
    }
    return this.service.staffRota(
      rotaActorFromRequest(request, orgId, activeSiteId),
      parseVolunteeringInput(staffVolunteeringRangeSchema, query),
    );
  }

  @Put(":reservationId/cancellation")
  cancel(
    @Param("siteId") rawSiteId: string,
    @Param("reservationId") rawReservationId: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") activeSiteId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req()
    request: Request & { authUserId?: string; authIsSuperUser?: boolean },
  ) {
    const siteId = parseVolunteeringInput(idSchema, rawSiteId);
    if (siteId !== activeSiteId) {
      throw new NotFoundException("Reservation not found");
    }
    return this.service.cancelByManager(
      rotaActorFromRequest(request, orgId, activeSiteId),
      parseVolunteeringInput(idSchema, rawReservationId),
      parseVolunteeringInput(cancelSchema, body).reason,
    );
  }
}
