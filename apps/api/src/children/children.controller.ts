import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  UseGuards,
  Inject,
  Req,
  Res,
  Header,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentTenant, PathwayRequestContext, UserOrgRole } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { ChildrenService } from "./children.service";
import { createChildSchema, CreateChildDto } from "./dto/create-child.dto";
import { UpdateChildDto, updateChildSchema } from "./dto/update-child.dto";
import { uploadChildPhotoDto } from "./dto/upload-photo.dto";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  __pathwayContext?: { siteRole?: string | null };
};

@Controller("children")
@UseGuards(AuthUserGuard)
export class ChildrenController {
  constructor(
    @Inject(ChildrenService) private readonly childrenService: ChildrenService,
    @Inject(PathwayRequestContext) private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  async list(@CurrentTenant("tenantId") tenantId: string) {
    return this.childrenService.list(tenantId);
  }

  @Get(":id/photo")
  @Header("Cache-Control", "private, max-age=300")
  async getPhoto(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Res() res: Response,
  ) {
    const result = await this.childrenService.getPhoto(id, tenantId);
    if (!result) {
      throw new NotFoundException("Photo not found");
    }
    res.setHeader("Content-Type", result.contentType);
    res.send(result.buffer);
  }

  @Get(":id")
  async getById(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    return this.childrenService.getById(id, tenantId);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = createChildSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    return this.childrenService.create(parsed.data as CreateChildDto, tenantId);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = updateChildSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    const userId = req.authUserId;
    const isSiteAdmin =
      req.__pathwayContext?.siteRole === "SITE_ADMIN";
    return this.childrenService.update(
      id,
      parsed.data as UpdateChildDto,
      tenantId,
      userId,
      isSiteAdmin,
    );
  }

  @Post(":id/photo")
  async uploadPhoto(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Authentication required");
    }
    const parsed = uploadChildPhotoDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    const isSiteAdmin =
      req.__pathwayContext?.siteRole === "SITE_ADMIN";
    await this.childrenService.uploadPhoto(
      id,
      tenantId,
      userId,
      isSiteAdmin,
      parsed.data.photoBase64,
      parsed.data.photoContentType,
    );
    return { ok: true };
  }

  @Post(":id/link-parent")
  async linkParent(
    @Param("id") id: string,
    @Body() body: { email?: string },
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Authentication required");
    }
    const email = body?.email?.trim();
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    return this.childrenService.linkParentByEmail(
      id,
      tenantId,
      userId,
      email,
    );
  }

  /**
   * Invite a parent to the child. Only ORG_ADMIN or a linked parent can invite.
   * If user exists: link to child and grant family access.
   * If user doesn't exist: create user, send invite email, link to child.
   */
  @Post(":id/invite-parent")
  async inviteParent(
    @Param("id") id: string,
    @Body() body: { email?: string; name?: string },
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Authentication required");
    }
    const email = body?.email?.trim();
    if (!email) {
      throw new BadRequestException("Email is required");
    }
    const isOrgAdmin = this.requestContext.roles.org.some(
      (r) => r === UserOrgRole.ORG_ADMIN,
    );
    return this.childrenService.inviteParentToChild(
      id,
      tenantId,
      userId,
      isOrgAdmin,
      email,
      body?.name?.trim() || undefined,
    );
  }
}
