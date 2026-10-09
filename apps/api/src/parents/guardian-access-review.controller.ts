import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CurrentOrg, CurrentTenant } from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { assertOrgAdminAccess } from "../orgs/org-admin-access";
import { GuardianAccessReviewService } from "./guardian-access-review.service";

const approvalSchema = z
  .object({
    reviewBasis: z.enum(["SCHOOL_RECORDS", "LEGAL_DOCUMENT"]),
    confirmedLegalAccess: z.literal(true),
  })
  .strict();

const revocationSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@RequirePermission("children.manage")
@Controller("parents/:parentId/guardian-access")
export class GuardianAccessReviewController {
  constructor(
    @Inject(GuardianAccessReviewService)
    private readonly service: GuardianAccessReviewService,
  ) {}

  @Get()
  async list(
    @Param("parentId") parentId: string,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "review guardian access",
    );
    return this.service.list(tenantId, orgId, parentId);
  }

  @Post(":childId")
  async approve(
    @Param("parentId") parentId: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = approvalSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "approve guardian access",
    );
    return this.service.approve(
      tenantId,
      orgId,
      actorUserId,
      parentId,
      childId,
      parsed.data.reviewBasis,
    );
  }

  @Delete(":childId")
  async revoke(
    @Param("parentId") parentId: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = revocationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "revoke guardian access",
    );
    return this.service.revoke(
      tenantId,
      orgId,
      actorUserId,
      parentId,
      childId,
      parsed.data.reason,
    );
  }
}
