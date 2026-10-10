import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentOrg,
  CurrentTenant,
  PathwayRequestContext,
} from "@pathway/auth";
import type { Request } from "express";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import type { VerifiedPrincipal } from "../auth/token-verifier";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { assertOrgAdminAccess } from "../orgs/org-admin-access";
import { StudentAccessService } from "./student-access.service";
import { StudentInviteAcceptanceService } from "./student-invite-acceptance.service";
import { StudentInvitesService } from "./student-invites.service";
import { StudentPortalPolicyService } from "./student-portal-policy.service";

const inviteSchema = z
  .object({
    email: z.string().trim().email().max(254),
    confirmedSchoolApproval: z.literal(true),
  })
  .strict();
const approvalSchema = inviteSchema.pick({ confirmedSchoolApproval: true });
const policySchema = z.object({ enabled: z.boolean() }).strict();
const revokeSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@RequirePermission("students.manage")
@Controller("student-invites")
export class StudentInvitesStaffController {
  constructor(
    @Inject(StudentInvitesService)
    private readonly invites: StudentInvitesService,
    @Inject(StudentPortalPolicyService)
    private readonly policy: StudentPortalPolicyService,
    @Inject(StudentAccessService)
    private readonly access: StudentAccessService,
  ) {}

  @Get("policy")
  async getPolicy(
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "read student policy",
    );
    return this.policy.get(tenantId, orgId);
  }

  @Put("policy")
  async setPolicy(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "change student policy",
    );
    return this.policy.set(tenantId, orgId, actorUserId, parsed.data.enabled);
  }

  @Get("children/:childId")
  async list(
    @Param("childId") childId: string,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "list student invitations",
    );
    return this.invites.list(tenantId, orgId, childId);
  }

  @Post("children/:childId")
  async create(
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "invite a student",
    );
    return this.invites.create(
      tenantId,
      orgId,
      actorUserId,
      childId,
      parsed.data.email,
    );
  }

  @Get("children/:childId/access")
  async getAccess(
    @Param("childId") childId: string,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "read student access",
    );
    return this.access.get(tenantId, orgId, childId);
  }

  @Delete("children/:childId/access")
  async revokeAccess(
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "revoke student access",
    );
    return this.access.revoke(
      tenantId,
      orgId,
      actorUserId,
      childId,
      parsed.data.reason,
    );
  }

  @Post(":inviteId/resend")
  async resend(
    @Param("inviteId") inviteId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = approvalSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "resend a student invitation",
    );
    return this.invites.resend(tenantId, orgId, actorUserId, inviteId);
  }

  @Post(":inviteId/revoke")
  async revoke(
    @Param("inviteId") inviteId: string,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "revoke a student invitation",
    );
    return this.invites.revoke(tenantId, orgId, actorUserId, inviteId);
  }
}

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("student-invites/sites/:siteId")
export class StudentInvitesAcceptanceController {
  constructor(
    @Inject(StudentInviteAcceptanceService)
    private readonly service: StudentInviteAcceptanceService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get(":inviteId")
  async get(
    @Param("siteId") siteId: string,
    @Param("inviteId") inviteId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.getForInvitee(
      siteId,
      inviteId,
      this.userId(request),
      await this.service.verifiedEmail(this.principal()),
    );
  }

  @Post(":inviteId/accept")
  async accept(
    @Param("siteId") siteId: string,
    @Param("inviteId") inviteId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.accept(
      siteId,
      inviteId,
      this.userId(request),
      await this.service.verifiedEmail(this.principal()),
    );
  }

  private userId(request: AuthenticatedRequest): string {
    if (!request.authUserId) throw new UnauthorizedException();
    return request.authUserId;
  }

  private principal(): VerifiedPrincipal {
    const claims = this.requestContext.requireContext().rawClaims;
    if (
      (claims.provider !== "clerk" && claims.provider !== "auth0") ||
      typeof claims.sub !== "string"
    ) {
      throw new UnauthorizedException();
    }
    return {
      provider: claims.provider,
      sub: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      emailVerified: claims.emailVerified === true,
    };
  }
}
