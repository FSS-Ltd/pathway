import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Res,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentTenant, CurrentOrg } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { StaffService } from "./staff.service";
import { updateStaffDto } from "./dto/update-staff.dto";
import { updateProfileDto } from "./dto/update-profile.dto";
import { uploadAvatarDto } from "./dto/upload-avatar.dto";

const forSessionAssignmentQuery = z.object({
  groupId: z.string().uuid().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});

@UseGuards(AuthUserGuard)
@Controller("staff")
export class StaffController {
  constructor(@Inject(StaffService) private readonly staffService: StaffService) {}

  @Get("profile")
  async getProfile(
    @Req() req: Request & { authUserId?: string },
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Not authenticated");
    }
    if (!tenantId || !orgId) {
      throw new BadRequestException("Active site context required");
    }
    return this.staffService.getProfileForCurrentUser(userId, tenantId, orgId);
  }

  @Patch("profile")
  async updateProfile(
    @Req() req: Request & { authUserId?: string },
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Not authenticated");
    }
    if (!tenantId || !orgId) {
      throw new BadRequestException("Active site context required");
    }
    const parsed = updateProfileDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.staffService.updateProfile(userId, tenantId, orgId, parsed.data);
  }

  @Get("profile/avatar")
  async getAvatar(
    @Req() req: Request & { authUserId?: string },
    @Res() res: Response,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Not authenticated");
    }
    const result = await this.staffService.getAvatar(userId);
    if (!result) {
      throw new NotFoundException("Avatar not found");
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(result.buffer);
  }

  @Post("profile/avatar")
  async uploadAvatar(
    @Req() req: Request & { authUserId?: string },
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new BadRequestException("Not authenticated");
    }
    if (!tenantId) {
      throw new BadRequestException("Active site context required");
    }
    const parsed = uploadAvatarDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    await this.staffService.uploadAvatar(
      userId,
      tenantId,
      parsed.data.photoBase64,
      parsed.data.photoContentType,
    );
    return { ok: true };
  }

  @Get("for-session-assignment")
  async getForSessionAssignment(
    @Query() query: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException("Active site context required");
    }
    const parsed = forSessionAssignmentQuery.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { groupId, startsAt, endsAt } = parsed.data;
    return this.staffService.getStaffForSessionAssignment(tenantId, {
      groupId: groupId ?? null,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    });
  }

  @Get(":userId")
  async getById(
    @Param("userId") userId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    if (!tenantId || !orgId) {
      throw new BadRequestException("Active site context required");
    }
    try {
      return await this.staffService.getById(userId, tenantId, orgId);
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw e;
    }
  }

  @Patch(":userId")
  async update(
    @Param("userId") userId: string,
    @Req() req: Request & { authUserId?: string },
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
  ) {
    if (!tenantId || !orgId) {
      throw new BadRequestException("Active site context required");
    }
    const callerUserId = req.authUserId;
    if (!callerUserId) {
      throw new BadRequestException("Not authenticated");
    }
    const parsed = updateStaffDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return await this.staffService.update(
      userId,
      tenantId,
      orgId,
      parsed.data,
      callerUserId,
    );
  }
}
