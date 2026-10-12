import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  assignmentListQueryDto,
  assignmentRequestDto,
} from "./dto/assignment.dto";
import {
  AssignmentsService,
  type AssignRoleCommand,
} from "./assignments.service";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { roleApiError } from "./role-api-error";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "./request-id";
import type { RoleActorContext } from "./roles.service";

const assignmentIdParam = z
  .object({ assignmentId: z.string().uuid() })
  .strict();

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("access/assignments")
export class AssignmentsController {
  constructor(
    @Inject(AssignmentsService)
    private readonly assignments: AssignmentsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("platform.access.assignments.read")
  async list(
    @Query() query: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    return this.assignments.list(
      this.actor(request, requestId),
      parseAssignmentListQuery(query, requestId),
    );
  }

  @Post()
  @RequirePermission("platform.access.assignments.manage")
  async assign(
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    const actor = this.actor(request, requestId);
    const parsed = parseAssignmentRequest(body, requestId);
    const inputs = Array.isArray(parsed) ? parsed : [parsed];
    const commands: AssignRoleCommand[] = inputs.map((input) => ({
      ...input,
      orgId: actor.orgId,
      tenantId: actor.tenantId,
    }));
    const assignments = await this.assignments.assign(commands, actor);
    return Array.isArray(parsed) ? assignments : assignments[0];
  }

  @Delete(":assignmentId")
  @RequirePermission("platform.access.assignments.manage")
  revoke(
    @Param() params: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    const { assignmentId } = parseAssignmentId(params, requestId);
    return this.assignments.revoke(
      assignmentId,
      this.actor(request, requestId),
    );
  }

  private actor(
    request: RequestWithRequestId,
    requestId = getOrCreateRequestId(request),
  ): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(
        400,
        "INVALID_ASSIGNMENT_REQUEST",
        requestId,
      );
    }
    return {
      orgId: context.org.orgId,
      tenantId: context.tenant.tenantId || undefined,
      userId: context.user.userId,
      legacyOrgRoles: context.roles.org,
      requestId,
    };
  }
}

function parseAssignmentRequest(body: unknown, requestId: string) {
  const result = assignmentRequestDto.safeParse(body);
  if (!result.success) {
    throw roleApiError(400, "INVALID_ASSIGNMENT_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}

function parseAssignmentListQuery(query: unknown, requestId: string) {
  const result = assignmentListQueryDto.safeParse(query);
  if (!result.success) {
    throw roleApiError(400, "INVALID_ASSIGNMENT_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}

function parseAssignmentId(params: unknown, requestId: string) {
  const result = assignmentIdParam.safeParse(params);
  if (!result.success) {
    throw roleApiError(400, "INVALID_ASSIGNMENT_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}
