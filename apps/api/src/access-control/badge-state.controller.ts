import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { ACCESS_TAG_DEFINITIONS, type AccessTagKey } from "@pathway/platform";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { BadgeStateService } from "./badge-state.service";
import { BadgeMatrixService } from "./badge-matrix.service";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { roleApiError } from "./role-api-error";
import { getOrCreateRequestId, type RequestWithRequestId } from "./request-id";

const paramsSchema = z
  .object({
    userId: z.string().uuid(),
    tagKey: z
      .string()
      .refine((key): key is AccessTagKey =>
        Object.prototype.hasOwnProperty.call(ACCESS_TAG_DEFINITIONS, key),
      ),
  })
  .strict();

const bodySchema = z
  .object({
    scope: z.enum(["organisation", "site"]),
    state: z.enum(["enabled", "excluded", "inherit"]),
    expectedRevision: z.string().max(1024),
  })
  .strict();

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@Controller("access/tags")
export class BadgeStateController {
  constructor(
    @Inject(BadgeStateService) private readonly badges: BadgeStateService,
    @Inject(BadgeMatrixService) private readonly matrix: BadgeMatrixService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  @Get("matrix")
  @RequirePermission("platform.access.permissions.read")
  catalogue(@Req() request: RequestWithRequestId) {
    return this.matrix.catalogue(this.actor(request));
  }

  @Get("users/:userId/matrix")
  @RequirePermission("platform.access.users.read")
  forUser(
    @Param("userId") userId: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const parsed = z.string().uuid().safeParse(userId);
    if (!parsed.success) {
      throw roleApiError(
        400,
        "INVALID_ACCESS_TAG_REQUEST",
        getOrCreateRequestId(request),
      );
    }
    return this.matrix.forUser(this.actor(request), parsed.data);
  }

  @Put("users/:userId/:tagKey")
  @RequirePermission("platform.access.assignments.manage")
  set(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithRequestId,
  ) {
    const requestId = getOrCreateRequestId(request);
    const parsedParams = paramsSchema.safeParse(params);
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      throw roleApiError(400, "INVALID_ACCESS_TAG_REQUEST", requestId);
    }
    return this.badges.set(this.actor(request), {
      ...parsedParams.data,
      ...parsedBody.data,
    });
  }

  private actor(request: RequestWithRequestId) {
    const requestId = getOrCreateRequestId(request);
    const context = this.context.requireContext();
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
