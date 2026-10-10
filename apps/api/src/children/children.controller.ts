import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
  Inject,
  Req,
  Res,
  Header,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CurrentTenant } from "@pathway/auth";
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
  ) {}

  @Get()
  async list(
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertStaff(req);
    return this.childrenService.list(tenantId);
  }

  @Get(":id/photo")
  @Header("Cache-Control", "private, max-age=300")
  async getPhoto(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    await this.childrenService.assertCanViewChild(
      id,
      tenantId,
      req.authUserId,
      this.isStaff(req),
    );
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
    @Req() req: AuthenticatedRequest,
  ) {
    await this.childrenService.assertCanViewChild(
      id,
      tenantId,
      req.authUserId,
      this.isStaff(req),
    );
    return this.childrenService.getById(id, tenantId);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.assertStaff(req);
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
    const isSiteAdmin = req.__pathwayContext?.siteRole === "SITE_ADMIN";
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
    const isSiteAdmin = req.__pathwayContext?.siteRole === "SITE_ADMIN";
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

  private isStaff(req: AuthenticatedRequest): boolean {
    return (
      req.__pathwayContext?.siteRole === "SITE_ADMIN" ||
      req.__pathwayContext?.siteRole === "STAFF"
    );
  }

  private assertStaff(req: AuthenticatedRequest): void {
    if (!this.isStaff(req))
      throw new ForbiddenException("Staff access required");
  }
}
