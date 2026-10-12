import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Post,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import type { Request } from "express";
import {
  CurrentOrg,
  CurrentTenant,
  PathwayRequestContext,
  UserOrgRole,
  UserTenantRole,
} from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { ParentsService } from "./parents.service";
import { PublicSignupService } from "../public-signup/public-signup.service";
import type { ParentDetailDto, ParentSummaryDto } from "./dto/parents.dto";
import {
  updateParentSchema,
  type UpdateParentDto,
} from "./dto/update-parent.dto";
import {
  LinkChildrenExistingUserDto,
} from "./dto/link-children-existing-user.dto";

interface AuthRequest extends Request {
  authUserId?: string;
}

@Controller("parents")
@UseGuards(AuthUserGuard)
export class ParentsController {
  constructor(
    @Inject(ParentsService) private readonly parentsService: ParentsService,
    @Inject(PublicSignupService) private readonly publicSignupService: PublicSignupService,
    @Inject(PathwayRequestContext) private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  async list(
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ): Promise<ParentSummaryDto[]> {
    this.assertStaffAccess();
    return this.parentsService.findAllForTenant(tenantId, orgId);
  }

  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @Req() req: AuthRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ): Promise<ParentDetailDto> {
    const isOwnProfile = req.authUserId === id;
    const isOrgAdmin = this.requestContext.roles.org.some(
      (r) => r === UserOrgRole.ORG_ADMIN,
    );
    if (!isOwnProfile && !isOrgAdmin) {
      this.assertStaffAccess();
    }
    const parent = await this.parentsService.findOneForTenant(
      tenantId,
      orgId,
      id,
    );
    if (!parent) {
      throw new NotFoundException("Parent not found");
    }
    return parent;
  }

  @Post("link-children-existing-user")
  async linkChildrenExistingUser(
    @Req() req: AuthRequest,
    @Body() body: LinkChildrenExistingUserDto,
  ): Promise<{ success: true; linkedCount: number }> {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Authentication required");
    }
    const childIds = body.children?.map((c) => c.childId) ?? [];
    const childrenToCreate = body.childrenToCreate;
    return this.publicSignupService.linkChildrenExistingUser(
      userId,
      body.inviteToken,
      childIds,
      childrenToCreate,
    );
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ): Promise<ParentDetailDto> {
    const isOwnProfile = req.authUserId === id;
    const isOrgAdmin = this.requestContext.roles.org.some(
      (r) => r === UserOrgRole.ORG_ADMIN,
    );
    if (!isOwnProfile && !isOrgAdmin) {
      this.assertStaffAccess();
    }
    const parsed = updateParentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.parentsService.updateForTenant(
      tenantId,
      orgId,
      id,
      parsed.data as UpdateParentDto,
    );
  }

  private assertStaffAccess() {
    const roles = this.requestContext.roles;
    const allowedTenant = [
      UserTenantRole.ADMIN,
      UserTenantRole.COORDINATOR,
      UserTenantRole.TEACHER,
      UserTenantRole.STAFF,
    ];
    const allowedOrg = [UserOrgRole.ORG_ADMIN, UserOrgRole.SAFEGUARDING_LEAD];
    const allowed =
      roles.tenant.some((role) => allowedTenant.includes(role)) ||
      roles.org.some((role) => allowedOrg.includes(role));

    if (!allowed) {
      throw new ForbiddenException(
        "Insufficient role to access parents/guardians",
      );
    }
  }
}
