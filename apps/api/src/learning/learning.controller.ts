import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CurrentTenant } from "@pathway/auth";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { RequireCapability } from "../platform/capability.decorator";
import { CapabilityGuard } from "../platform/capability.guard";
import {
  createEvidenceSchema,
  createLearningLogSchema,
  createReportBundleSchema,
  createSubjectSchema,
} from "./dto";
import { LearningService } from "./learning.service";

type AuthenticatedRequest = Request & { authUserId?: string };

const idSchema = z.string().uuid();

@Controller("learning")
@UseGuards(AuthUserGuard, CapabilityGuard)
export class LearningController {
  constructor(@Inject(LearningService) private readonly service: LearningService) {}

  @Get("subjects")
  @RequireCapability("learning.log.read")
  listSubjects(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listSubjects(tenantId);
  }

  @Post("subjects")
  @RequireCapability("learning.log.write")
  createSubject(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    return this.service.createSubject(this.parse(createSubjectSchema, body), tenantId);
  }

  @Get("logs")
  @RequireCapability("learning.log.read")
  listLogs(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listLogs(tenantId);
  }

  @Get("logs/:id")
  @RequireCapability("learning.log.read")
  getLog(@Param("id") rawId: string, @CurrentTenant("tenantId") tenantId: string) {
    return this.service.getLog(this.parseId(rawId), tenantId);
  }

  @Post("logs")
  @RequireCapability("learning.log.write")
  createLog(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createLog(
      this.parse(createLearningLogSchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  @Get("evidence")
  @RequireCapability("learning.evidence.read")
  listEvidence(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listEvidence(tenantId);
  }

  @Get("evidence/:id")
  @RequireCapability("learning.evidence.read")
  getEvidence(@Param("id") rawId: string, @CurrentTenant("tenantId") tenantId: string) {
    return this.service.getEvidenceById(this.parseId(rawId), tenantId);
  }

  @Post("evidence")
  @RequireCapability("learning.evidence.write")
  createEvidence(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createEvidence(
      this.parse(createEvidenceSchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  @Get("report-bundles")
  @RequireCapability("learning.reports.generate")
  listReportBundles(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listReportBundles(tenantId);
  }

  @Get("report-bundles/:id")
  @RequireCapability("learning.reports.generate")
  getReportBundle(@Param("id") rawId: string, @CurrentTenant("tenantId") tenantId: string) {
    return this.service.getReportBundle(this.parseId(rawId), tenantId);
  }

  @Post("report-bundles")
  @RequireCapability("learning.reports.generate")
  createReportBundle(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createReportBundle(
      this.parse(createReportBundleSchema, body),
      tenantId,
      this.actorId(request),
    );
  }

  @Get("report-bundles/:id/download")
  @RequireCapability("learning.reports.generate")
  async downloadReportBundle(
    @Param("id") rawId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Res() response: Response,
  ) {
    const result = await this.service.getBundleFile(this.parseId(rawId), tenantId);
    if (!result) throw new NotFoundException("Report bundle not available");
    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`,
    );
    response.send(result.buffer);
  }

  private actorId(request: AuthenticatedRequest): string {
    if (!request.authUserId) {
      throw new BadRequestException("Authentication required");
    }
    return request.authUserId;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return parsed.data;
  }

  private parseId(value: string): string {
    return this.parse(idSchema, value);
  }
}
