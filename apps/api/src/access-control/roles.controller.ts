import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  cloneRoleDto,
  createRoleDto,
  retireRoleDto,
  updateRoleDto,
} from "./dto/role.dto";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { RolesService, type RoleActorContext } from "./roles.service";
import { roleApiError } from "./role-api-error";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "./request-id";

const roleIdParam = z.object({ roleId: z.string().uuid() });
const replacePermissionsDto = z.object({
  expectedVersion: z.number().int().positive(),
  permissionKeys: z.array(z.string().min(1)).min(1),
}).strict();

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("access/roles")
export class RolesController {
  constructor(
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(PathwayRequestContext) private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("platform.access.roles.read")
  list(@Req() request: RequestWithRequestId) {
    return this.roles.list(this.actor(request));
  }

  @Post()
  @RequirePermission("platform.access.roles.manage")
  async create(@Body() body: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    return this.roles.create(
      parse(createRoleDto, body, requestId),
      this.actor(request, requestId),
    );
  }

  @Get(":roleId")
  @RequirePermission("platform.access.roles.read")
  async get(@Param() params: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    return this.roles.get(
      parse(roleIdParam, params, requestId).roleId,
      this.actor(request, requestId),
    );
  }

  @Patch(":roleId")
  @RequirePermission("platform.access.roles.manage")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    return this.roles.update({
      roleId: parse(roleIdParam, params, requestId).roleId,
      ...parse(updateRoleDto, body, requestId),
    }, this.actor(request, requestId));
  }

  @Post(":roleId/clone")
  @RequirePermission("platform.access.roles.manage")
  async clone(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    return this.roles.clone(
      parse(roleIdParam, params, requestId).roleId,
      parse(cloneRoleDto, body, requestId),
      this.actor(request, requestId),
    );
  }

  @Put(":roleId/permissions")
  @RequirePermission("platform.access.roles.manage")
  async replacePermissions(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    const roleId = parse(roleIdParam, params, requestId).roleId;
    const replacement = parse(replacePermissionsDto, body, requestId);
    const actor = this.actor(request, requestId);
    const current = await this.roles.get(roleId, actor);
    return this.roles.update({
      roleId,
      expectedVersion: replacement.expectedVersion,
      name: current.name,
      description: current.description ?? undefined,
      permissionKeys: replacement.permissionKeys,
    }, actor);
  }

  @Post(":roleId/retire")
  @RequirePermission("platform.access.roles.manage")
  async retire(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    return this.roles.retire(
      parse(roleIdParam, params, requestId).roleId,
      parse(retireRoleDto, body, requestId),
      this.actor(request, requestId),
    );
  }

  private actor(
    request: RequestWithRequestId,
    requestId = getOrCreateRequestId(request),
  ): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(400, "INVALID_ROLE_REQUEST", requestId);
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

function parse<T>(schema: z.ZodType<T>, value: unknown, requestId: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw roleApiError(400, "INVALID_ROLE_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}
