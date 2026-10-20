import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  createHomeworkSchema,
  homeworkAssignmentIdSchema,
  updateHomeworkSchema,
} from "./dto/create-homework.dto";
import { HomeworkService } from "./homework.service";
import {
  cancelHomeworkSchema,
  publishHomeworkSchema,
  scheduleHomeworkSchema,
} from "./dto/publish-homework.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/homework/assignments")
export class HomeworkController {
  constructor(
    @Inject(HomeworkService) private readonly service: HomeworkService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("ace.homework.assignments.manage")
  list() {
    return this.service.list(this.actor());
  }

  @Get("options")
  @RequirePermission("ace.homework.assignments.manage")
  options() {
    return this.service.options(this.actor());
  }

  @Post()
  @RequirePermission("ace.homework.assignments.manage")
  create(@Body() body: unknown) {
    const result = createHomeworkSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.service.create(result.data, this.actor());
  }

  @Patch(":id")
  @RequirePermission("ace.homework.assignments.manage")
  update(@Param("id") id: string, @Body() body: unknown) {
    const idResult = homeworkAssignmentIdSchema.safeParse(id);
    const inputResult = updateHomeworkSchema.safeParse(body);
    if (!idResult.success || !inputResult.success) {
      throw new BadRequestException("Invalid homework assignment update");
    }
    return this.service.update(idResult.data, inputResult.data, this.actor());
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.homework.assignments.manage")
  publish(@Param("id") id: string, @Body() body: unknown) {
    const idResult = homeworkAssignmentIdSchema.safeParse(id);
    const inputResult = publishHomeworkSchema.safeParse(body);
    if (!idResult.success || !inputResult.success) {
      throw new BadRequestException("Invalid homework publication request");
    }
    return this.service.publish(idResult.data, inputResult.data, this.actor());
  }

  @Post(":id/schedule")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.homework.assignments.manage")
  schedule(@Param("id") id: string, @Body() body: unknown) {
    const idResult = homeworkAssignmentIdSchema.safeParse(id);
    const inputResult = scheduleHomeworkSchema.safeParse(body);
    if (!idResult.success || !inputResult.success) {
      throw new BadRequestException("Invalid homework schedule request");
    }
    return this.service.schedule(idResult.data, inputResult.data, this.actor());
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.homework.assignments.manage")
  cancel(@Param("id") id: string, @Body() body: unknown) {
    const idResult = homeworkAssignmentIdSchema.safeParse(id);
    const inputResult = cancelHomeworkSchema.safeParse(body);
    if (!idResult.success || !inputResult.success) {
      throw new BadRequestException("Invalid homework cancellation request");
    }
    return this.service.cancel(idResult.data, inputResult.data, this.actor());
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
