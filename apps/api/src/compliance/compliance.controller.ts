import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
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
import {
  complianceHistorySchema,
  complianceIdSchema,
  complianceListSchema,
  compliancePeopleSchema,
  complianceRecordInputSchema,
  complianceUpdateSchema,
  complianceVersionSchema,
} from "./compliance.dto";
import { ComplianceService } from "./compliance.service";

function parse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(
    @Inject(ComplianceService) private readonly service: ComplianceService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  private actor() {
    const context = this.context.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }

  @Get("checks")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.read")
  list(@Query() query: unknown) {
    return this.service.list(parse(complianceListSchema, query), this.actor());
  }

  @Post("checks")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.manage")
  create(@Body() body: unknown) {
    return this.service.create(
      parse(complianceRecordInputSchema, body),
      this.actor(),
    );
  }

  @Get("people")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.manage")
  people(@Query() query: unknown) {
    return this.service.people(
      parse(compliancePeopleSchema, query).query,
      this.actor(),
    );
  }

  @Get("checks/:id")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.read")
  get(@Param("id") id: string) {
    return this.service.get(parse(complianceIdSchema, id), this.actor());
  }

  @Patch("checks/:id")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.manage")
  update(@Param("id") id: string, @Body() body: unknown) {
    const { expectedVersion, ...input } = parse(complianceUpdateSchema, body);
    return this.service.update(
      parse(complianceIdSchema, id),
      input,
      expectedVersion,
      this.actor(),
    );
  }

  @Post("checks/:id/archive")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.manage")
  archive(@Param("id") id: string, @Body() body: unknown) {
    return this.service.archive(
      parse(complianceIdSchema, id),
      parse(complianceVersionSchema, body).expectedVersion,
      this.actor(),
    );
  }

  @Get("checks/:id/export")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.manage")
  exportRecord(@Param("id") id: string, @Query() query: unknown) {
    return this.service.exportRecord(
      parse(complianceIdSchema, id),
      parse(complianceHistorySchema, query).cursor,
      this.actor(),
    );
  }

  @Get("checks/:id/history")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.checks.read")
  history(@Param("id") id: string, @Query() query: unknown) {
    return this.service.history(
      parse(complianceIdSchema, id),
      parse(complianceHistorySchema, query).cursor,
      this.actor(),
    );
  }
}
