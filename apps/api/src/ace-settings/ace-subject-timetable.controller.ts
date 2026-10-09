import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceSubjectTimetableDraftService } from "./ace-subject-timetable-draft.service";
import { AceSubjectTimetablePublicationService } from "./ace-subject-timetable-publication.service";
import { AceSubjectTimetableScheduleService } from "./ace-subject-timetable-schedule.service";
import {
  publishStudentTimetableSchema,
  saveStudentTimetableDraftSchema,
  saveTimetableScheduleSchema,
  timetableIdSchema,
  timetableRosterQuerySchema,
  withdrawStudentTimetableSchema,
} from "./dto/ace-subject-timetable.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@RequirePermission("ace.settings.manage")
@Controller("ace/subject-timetable")
export class AceSubjectTimetableController {
  constructor(
    @Inject(AceSubjectTimetableScheduleService)
    private readonly schedules: AceSubjectTimetableScheduleService,
    @Inject(AceSubjectTimetableDraftService)
    private readonly drafts: AceSubjectTimetableDraftService,
    @Inject(AceSubjectTimetablePublicationService)
    private readonly publications: AceSubjectTimetablePublicationService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("setup")
  getSetup() {
    return this.schedules.setup(this.actor());
  }

  @Get("periods/:periodId/year-bands/:yearBandId/schedule")
  getSchedule(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
  ) {
    return this.schedules.get(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
    );
  }

  @Put("periods/:periodId/year-bands/:yearBandId/schedule")
  saveSchedule(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
    @Body() body: unknown,
  ) {
    return this.schedules.save(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
      this.parse(saveTimetableScheduleSchema, body),
    );
  }

  @Get("periods/:periodId/year-bands/:yearBandId/roster")
  getRoster(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
    @Query() query: unknown,
  ) {
    return this.drafts.roster(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
      this.parse(timetableRosterQuerySchema, query),
    );
  }

  @Get("periods/:periodId/year-bands/:yearBandId/children/:childId/draft")
  getDraft(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
    @Param("childId") childId: string,
  ) {
    return this.drafts.get(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
      this.id(childId),
    );
  }

  @Put("periods/:periodId/year-bands/:yearBandId/children/:childId/draft")
  saveDraft(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
  ) {
    return this.drafts.save(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
      this.id(childId),
      this.parse(saveStudentTimetableDraftSchema, body),
    );
  }

  @Post("periods/:periodId/year-bands/:yearBandId/children/:childId/publish")
  publish(
    @Param("periodId") periodId: string,
    @Param("yearBandId") yearBandId: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
  ) {
    return this.publications.publish(
      this.actor(),
      this.id(periodId),
      this.id(yearBandId),
      this.id(childId),
      this.parse(publishStudentTimetableSchema, body),
    );
  }

  @Get("periods/:periodId/children/:childId/publications/:publicationId")
  getPublication(
    @Param("periodId") periodId: string,
    @Param("childId") childId: string,
    @Param("publicationId") publicationId: string,
  ) {
    return this.publications.get(
      this.actor(),
      this.id(periodId),
      this.id(childId),
      this.id(publicationId),
    );
  }

  @Post("periods/:periodId/children/:childId/withdraw")
  withdraw(
    @Param("periodId") periodId: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
  ) {
    return this.publications.withdraw(
      this.actor(),
      this.id(periodId),
      this.id(childId),
      this.parse(withdrawStudentTimetableSchema, body),
    );
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }

  private id(value: string): string {
    return this.parse(timetableIdSchema, value);
  }

  private parse<S extends z.ZodTypeAny>(
    schema: S,
    value: unknown,
  ): z.output<S> {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
