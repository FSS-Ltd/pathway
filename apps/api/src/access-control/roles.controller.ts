import {
  Controller,
  Get,
  HttpStatus,
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
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { RolesService, type RoleActorContext } from "./roles.service";
import { roleApiError } from "./role-api-error";
import { getOrCreateRequestId, type RequestWithRequestId } from "./request-id";

const roleIdParam = z.object({ roleId: z.string().uuid() });

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("access/roles")
export class RolesController {
  constructor(
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("platform.access.roles.read")
  list(@Req() request: RequestWithRequestId) {
    return this.roles.list(this.actor(request));
  }

  @Post()
  @RequirePermission("platform.access.roles.manage")
  create(@Req() request: RequestWithRequestId): never {
    return this.rejectLegacyWrite(request);
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
  update(@Req() request: RequestWithRequestId): never {
    return this.rejectLegacyWrite(request);
  }

  @Post(":roleId/clone")
  @RequirePermission("platform.access.roles.manage")
  clone(@Req() request: RequestWithRequestId): never {
    return this.rejectLegacyWrite(request);
  }

  @Put(":roleId/permissions")
  @RequirePermission("platform.access.roles.manage")
  replacePermissions(@Req() request: RequestWithRequestId): never {
    return this.rejectLegacyWrite(request);
  }

  @Post(":roleId/retire")
  @RequirePermission("platform.access.roles.manage")
  retire(@Req() request: RequestWithRequestId): never {
    return this.rejectLegacyWrite(request);
  }

  private rejectLegacyWrite(request: RequestWithRequestId): never {
    throw roleApiError(
      HttpStatus.GONE,
      "CUSTOM_ROLES_RETIRED",
      getOrCreateRequestId(request),
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
