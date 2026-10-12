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
import { AccessTagsService } from "./access-tags.service";
import {
  accessTagGrantDto,
  accessTagGrantIdParamDto,
  accessTagGrantListQueryDto,
} from "./dto/access-tag.dto";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { roleApiError } from "./role-api-error";
import { getOrCreateRequestId, type RequestWithRequestId } from "./request-id";
import type { RoleActorContext } from "./roles.service";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("access/tags")
export class AccessTagsController {
  constructor(
    @Inject(AccessTagsService)
    private readonly tags: AccessTagsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("catalogue")
  @RequirePermission("platform.access.permissions.read")
  catalogue() {
    return { tags: this.tags.catalogue() };
  }

  @Get("grants")
  @RequirePermission("platform.access.assignments.read")
  list(@Query() query: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    return this.tags.list(
      this.actor(requestId),
      parse(accessTagGrantListQueryDto, query, requestId),
    );
  }

  @Post("grants")
  @RequirePermission("platform.access.assignments.manage")
  grant(@Body() body: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    return this.tags.grant(
      parse(accessTagGrantDto, body, requestId),
      this.actor(requestId),
    );
  }

  @Delete("grants/:grantId")
  @RequirePermission("platform.access.assignments.manage")
  revoke(@Param() params: unknown, @Req() request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    const { grantId } = parse(accessTagGrantIdParamDto, params, requestId);
    return this.tags.revoke(grantId, this.actor(requestId));
  }

  private actor(requestId: string): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(400, "INVALID_ACCESS_TAG_REQUEST", requestId);
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

function parse<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  requestId: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw roleApiError(400, "INVALID_ACCESS_TAG_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}
