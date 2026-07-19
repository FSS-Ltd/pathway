import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
  Req,
  Inject,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { OrgsService } from "./orgs.service";
import { OrgPeopleService } from "./org-people.service";
import { registerOrgDto } from "./dto/register-org.dto";
import { uploadLogoDto } from "./dto/upload-logo.dto";
import { CurrentOrg } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { OrgRole, prisma } from "@pathway/db";
import { isVertical } from "@pathway/types";
import type { Request } from "express";

interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

const parseOrBadRequest = async <T>(
  schema: z.ZodTypeAny,
  data: unknown,
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new BadRequestException(e.flatten());
    }
    throw e;
  }
};

const slugParam = z
  .object({
    slug: z.string().min(1, "slug is required"),
  })
  .strict();

const updateCurrentOrgBody = z
  .object({
    name: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(2, "name must be at least 2 characters")
          .max(120, "name must be at most 120 characters"),
      )
      .optional(),
    parentPortalEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.parentPortalEnabled !== undefined,
    { message: "At least one field is required" },
  );

const updateCurrentVerticalBody = z
  .object({
    vertical: z.string(),
  })
  .strict();

@Controller("orgs")
export class OrgsController {
  constructor(
    @Inject(OrgsService) private readonly service: OrgsService,
    @Inject(OrgPeopleService) private readonly orgPeople: OrgPeopleService,
  ) {}

  /**
   * Registers a new organisation (and optional first tenant), optionally bootstrapping billing.
   * Accepts the DTO defined in register-org.dto. Returns created org, initial tenant (if any),
   * and admin/billing outcomes.
   */
  @Post("register")
  async register(@Body() body: unknown) {
    const dto = await parseOrBadRequest<typeof registerOrgDto._output>(
      registerOrgDto,
      body,
    );
    return this.service.register(dto);
  }

  /**
   * List organisations (MVP: no filters).
   */
  @Get()
  @UseGuards(AuthUserGuard)
  async list(@CurrentOrg("orgId") orgId: string) {
    return this.service.list(orgId);
  }

  /**
   * Export organisation data (metadata only). ORG_ADMIN only.
   */
  @Get("export")
  @UseGuards(AuthUserGuard)
  async exportData(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    return this.service.exportOrganisationData(orgId);
  }

  /**
   * Deactivate organisation. ORG_ADMIN only. Returns 501 until implemented.
   */
  @Post("deactivate")
  @UseGuards(AuthUserGuard)
  async deactivate(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    return this.service.deactivateOrganisation(orgId);
  }

  /**
   * Update current organisation profile (name). ORG_ADMIN only.
   */
  @Patch("current")
  @UseGuards(AuthUserGuard)
  async updateCurrent(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    const dto = await parseOrBadRequest<z.infer<typeof updateCurrentOrgBody>>(
      updateCurrentOrgBody,
      body,
    );
    return this.service.updateCurrentOrg(orgId, dto);
  }

  /**
   * Change the current organisation's platform vertical. ORG_ADMIN only.
   */
  @Patch("current/vertical")
  @UseGuards(AuthUserGuard)
  async updateCurrentVertical(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    const { vertical } = await parseOrBadRequest<
      z.infer<typeof updateCurrentVerticalBody>
    >(updateCurrentVerticalBody, body);
    if (!isVertical(vertical)) {
      throw new BadRequestException("Unknown vertical");
    }
    return this.service.changeVertical(orgId, vertical);
  }

  /**
   * Upload/replace the current org's white-label logo. ORG_ADMIN only.
   */
  @Post("current/logo")
  @UseGuards(AuthUserGuard)
  async uploadCurrentLogo(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    const dto = await parseOrBadRequest<z.infer<typeof uploadLogoDto>>(
      uploadLogoDto,
      body,
    );
    return this.service.uploadLogo(orgId, dto.logoBase64, dto.logoContentType);
  }

  /**
   * Revert the current org's logo to the default NexSteps mark. ORG_ADMIN only.
   */
  @Delete("current/logo")
  @UseGuards(AuthUserGuard)
  async deleteCurrentLogo(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.ensureOrgAdmin(req, orgId);
    return this.service.deleteLogo(orgId);
  }

  /**
   * Get retention policy for current org (read-only). Any authenticated org member.
   */
  @Get("current/retention")
  @UseGuards(AuthUserGuard)
  async getCurrentRetention(@CurrentOrg("orgId") orgId: string) {
    return this.service.getRetentionOverview(orgId);
  }

  /**
   * List people (users) with access to an organisation. ORG_ADMIN only.
   */
  @Get(":orgId/people")
  @UseGuards(AuthUserGuard)
  async listPeople(
    @Param("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orgPeople.listPeople(orgId, req.authUserId);
  }

  /**
   * List people removed from an organisation. ORG_ADMIN only.
   */
  @Get(":orgId/people/deleted")
  @UseGuards(AuthUserGuard)
  async listDeletedPeople(
    @Param("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orgPeople.listDeletedPeople(orgId, req.authUserId);
  }

  /**
   * Remove a person's access from an organisation. ORG_ADMIN only.
   */
  @Delete(":orgId/people/:userId")
  @UseGuards(AuthUserGuard)
  async removePerson(
    @Param("orgId") orgId: string,
    @Param("userId") userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orgPeople.removePerson(orgId, userId, req.authUserId);
  }

  /**
   * Fetch an organisation by slug.
   */
  @Get(":slug")
  @UseGuards(AuthUserGuard)
  async getBySlug(
    @Param() params: unknown,
    @CurrentOrg("orgId") orgId: string,
  ) {
    const { slug } = await parseOrBadRequest<typeof slugParam._output>(
      slugParam,
      params,
    );
    return this.service.getBySlug(slug, orgId);
  }

  private async ensureOrgAdmin(
    req: AuthenticatedRequest,
    orgId: string,
  ): Promise<void> {
    const userId = req.authUserId as string;
    if (!userId) {
      throw new UnauthorizedException("User ID not found in request");
    }
    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId,
        orgId,
        role: { in: [OrgRole.ORG_ADMIN] },
      },
    });
    const orgRole = membership
      ? null
      : await prisma.userOrgRole.findFirst({
          where: {
            userId,
            orgId,
            role: { in: [OrgRole.ORG_ADMIN] },
          },
        });
    if (!membership && !orgRole) {
      throw new UnauthorizedException(
        "You must be an Organisation admin to perform this action",
      );
    }
  }
}
