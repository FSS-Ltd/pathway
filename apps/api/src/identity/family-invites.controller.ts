import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
import { FamilyInvitesService } from "./family-invites.service";
import { GuardianInviteAcceptanceService } from "./guardian-invite-acceptance.service";

const createGuardianInviteSchema = z
  .object({
    email: z.string().trim().email().max(254),
    reviewBasis: z.enum(["SCHOOL_RECORDS", "LEGAL_DOCUMENT"]),
    confirmedLegalAccess: z.literal(true),
  })
  .strict();

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@IndependentTransaction()
@RequirePermission("children.manage")
@Controller("family-invites/guardian")
export class GuardianInvitesStaffController {
  constructor(
    @Inject(FamilyInvitesService)
    private readonly service: FamilyInvitesService,
  ) {}

  @Post("children/:childId")
  async create(
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const parsed = createGuardianInviteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "invite a guardian",
    );
    return this.service.createGuardianInvite(
      tenantId,
      orgId,
      actorUserId,
      childId,
      parsed.data.email,
      parsed.data.reviewBasis,
    );
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
      "list guardian invitations",
    );
    return this.service.listGuardianInvites(tenantId, orgId, childId);
  }

  @Post(":inviteId/resend")
  async resend(
    @Param("inviteId") inviteId: string,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const actorUserId = await assertOrgAdminAccess(
      request.authUserId,
      orgId,
      "resend a guardian invitation",
    );
    return this.service.resendGuardianInvite(
      tenantId,
      orgId,
      actorUserId,
      inviteId,
    );
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
      "revoke a guardian invitation",
    );
    return this.service.revokeGuardianInvite(
      tenantId,
      orgId,
      actorUserId,
      inviteId,
    );
  }
}

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("family-invites/sites/:siteId")
export class GuardianInvitesAcceptanceController {
  constructor(
    @Inject(GuardianInviteAcceptanceService)
    private readonly service: GuardianInviteAcceptanceService,
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
    const verifiedEmail = await this.service.verifiedEmail(this.principal());
    return this.service.acceptGuardianInvite(
      siteId,
      inviteId,
      this.userId(request),
      verifiedEmail,
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
