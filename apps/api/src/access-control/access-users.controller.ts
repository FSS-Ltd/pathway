import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { AccessUsersService } from "./access-users.service";
import { roleApiError } from "./role-api-error";
import type { RoleActorContext } from "./roles.service";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "./request-id";

const targetUserParam = z.object({ userId: z.string().uuid() }).strict();

@UseGuards(AuthUserGuard)
@Controller("access/users")
export class AccessUsersController {
  constructor(
    @Inject(AccessUsersService) private readonly accessUsers: AccessUsersService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get(":userId/effective-permissions")
  async getEffectivePermissions(
    @Param() params: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    const { userId } = parse(targetUserParam, params, requestId);
    return this.accessUsers.getEffectivePermissions(
      userId,
      this.actor(request, requestId),
    );
  }

  private actor(
    request: RequestWithRequestId,
    requestId = getOrCreateRequestId(request),
  ): RoleActorContext {
    const context = this.requestContext.requireContext();
    if (!context.org.orgId || !context.user.userId) {
      throw roleApiError(400, "INVALID_EFFECTIVE_ACCESS_REQUEST", requestId);
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
    throw roleApiError(400, "INVALID_EFFECTIVE_ACCESS_REQUEST", requestId, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}
