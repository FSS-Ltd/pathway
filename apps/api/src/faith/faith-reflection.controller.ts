import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import { z } from "zod";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  createReflectionSchema,
  listReflectionsSchema,
  moderateReflectionSchema,
  reportReflectionSchema,
} from "./dto/create-reflection.dto";
import { faithIdSchema } from "./faith.dto";
import { FaithReflectionService } from "./faith-reflection.service";

@UseGuards(AuthUserGuard)
@Controller("ace/faith/content/:id")
export class FaithReflectionController {
  constructor(
    @Inject(FaithReflectionService)
    private readonly reflections: FaithReflectionService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  @Post("read")
  async markRead(@Param("id") id: string, @Query("siteId") siteId?: string) {
    return this.reflections.markRead(
      this.parse(faithIdSchema, id),
      await this.actor("ace.faith.read", siteId),
    );
  }

  @Get("reflections")
  async list(@Param("id") id: string, @Query() query: unknown) {
    const parsed = this.parse(listReflectionsSchema, query);
    return this.reflections.list(
      this.parse(faithIdSchema, id),
      parsed,
      await this.actor("ace.faith.read", parsed.siteId),
    );
  }

  @Post("reflections")
  async submit(
    @Param("id") id: string,
    @Body() body: unknown,
    @Query("siteId") siteId?: string,
  ) {
    return this.reflections.submit(
      this.parse(faithIdSchema, id),
      this.parse(createReflectionSchema, body),
      await this.actor("ace.faith.reflect", siteId),
    );
  }

  @Post("reflections/:reflectionId/moderate")
  async moderate(
    @Param("id") id: string,
    @Param("reflectionId") reflectionId: string,
    @Body() body: unknown,
  ) {
    return this.reflections.moderate(
      this.parse(faithIdSchema, id),
      this.parse(faithIdSchema, reflectionId),
      this.parse(moderateReflectionSchema, body),
      await this.actor("ace.faith.manage"),
    );
  }

  @Post("reflections/:reflectionId/release")
  async release(
    @Param("id") id: string,
    @Param("reflectionId") reflectionId: string,
  ) {
    return this.reflections.release(
      this.parse(faithIdSchema, id),
      this.parse(faithIdSchema, reflectionId),
      await this.actor("ace.faith.manage"),
    );
  }

  @Post("reflections/:reflectionId/report")
  async report(
    @Param("id") id: string,
    @Param("reflectionId") reflectionId: string,
    @Body() body: unknown,
    @Query("childId") childId?: string,
    @Query("siteId") siteId?: string,
  ) {
    return this.reflections.report(
      this.parse(faithIdSchema, id),
      this.parse(faithIdSchema, reflectionId),
      this.parse(reportReflectionSchema, body),
      childId === undefined ? undefined : this.parse(faithIdSchema, childId),
      await this.actor("ace.faith.read", siteId),
    );
  }

  private async actor(permission: PermissionKey, siteId?: string) {
    const context = this.context.requireContext();
    const tenantId = siteId
      ? this.parse(faithIdSchema, siteId)
      : context.tenant.tenantId;
    if (!tenantId) throw new NotFoundException("Faith content not found");
    const site = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { orgId: true },
    });
    if (!site) throw new NotFoundException("Faith content not found");
    const decision = await this.permissions.resolve({
      tenantId,
      orgId: site.orgId,
      userId: context.user.userId,
      permission,
      now: new Date(),
    });
    if (!decision.allowed)
      throw new NotFoundException("Faith content not found");
    return {
      tenantId,
      orgId: site.orgId,
      userId: context.user.userId,
    };
  }

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return parsed.data;
  }
}
