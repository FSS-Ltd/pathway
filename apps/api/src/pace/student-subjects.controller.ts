import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { createStudentSubjectSchema } from "./dto/student-subject.dto";
import { StudentSubjectsService } from "./student-subjects.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/students")
export class StudentSubjectsController {
  constructor(
    private readonly service: StudentSubjectsService,
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get(":childId/subjects")
  @RequirePermission("ace.pace.read")
  list(@Param("childId") childId: string) {
    return this.service.list(childId, this.actor());
  }

  @Post(":childId/subjects")
  @RequirePermission("ace.pace.record")
  async place(@Param("childId") childId: string, @Body() body: unknown) {
    try {
      return await this.service.place(
        childId,
        await createStudentSubjectSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
