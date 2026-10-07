import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AceSubjectsService } from "./ace-subjects.service";
import {
  createAceSubjectSchema,
  deactivateAceSubjectSchema,
  renameAceSubjectSchema,
  subjectIdSchema,
} from "./dto/ace-subject.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/subjects")
export class AceSubjectsController {
  constructor(
    private readonly service: AceSubjectsService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("ace.settings.read")
  list() {
    return this.service.list(this.actor());
  }

  @Post()
  @RequirePermission("ace.settings.manage")
  create(@Body() body: unknown) {
    return this.service.create(
      this.parse(createAceSubjectSchema, body),
      this.actor(),
    );
  }

  @Patch(":id")
  @RequirePermission("ace.settings.manage")
  rename(@Param("id") id: string, @Body() body: unknown) {
    return this.service.rename(
      this.parse(subjectIdSchema, id),
      this.parse(renameAceSubjectSchema, body),
      this.actor(),
    );
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.settings.manage")
  deactivate(@Param("id") id: string, @Body() body: unknown) {
    return this.service.deactivate(
      this.parse(subjectIdSchema, id),
      this.parse(deactivateAceSubjectSchema, body),
      this.actor(),
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

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
