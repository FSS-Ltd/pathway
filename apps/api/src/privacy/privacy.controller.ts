import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { CurrentTenant, CurrentUser } from "@pathway/auth";
import type { Response } from "express";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { requestDeletionSchema, requestExportSchema } from "./dto";
import { PrivacyService } from "./privacy.service";

const idSchema = z.string().uuid();

// Household-config endpoints (nexsteps-home privacy-data screen) - plain
// AuthUserGuard, not CapabilityGuard, matching every other household-config
// endpoint in this plan (implementation-map.md:130-131). tenantId is
// resolved server-side from the bearer token via @CurrentTenant, never
// trusted from client input.
@Controller("privacy")
@UseGuards(AuthUserGuard)
export class PrivacyController {
  constructor(private readonly service: PrivacyService) {}

  @Get("exports")
  listExports(@CurrentTenant("tenantId") tenantId: string) {
    return this.service.listExports(tenantId);
  }

  @Post("exports")
  requestExport(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
  ) {
    const dto = this.parse(requestExportSchema, body);
    return this.service.requestExport(dto.kind, tenantId, userId);
  }

  @Get("exports/:id/download")
  async downloadExport(
    @Param("id") rawId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Res() response: Response,
  ) {
    const id = this.parseId(rawId);
    const result = await this.service.getExportFile(id, tenantId);
    if (!result) throw new NotFoundException("Export not available");
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    response.send(result.buffer);
  }

  @Post("deletion-requests")
  requestDeletion(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentUser("userId") userId: string,
    @CurrentUser("email") email: string | undefined,
    @CurrentUser("givenName") displayName: string | undefined,
  ) {
    const dto = this.parse(requestDeletionSchema, body);
    return this.service.requestDeletion(dto, tenantId, userId, email, displayName);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.format());
    return parsed.data;
  }

  private parseId(value: string): string {
    const parsed = idSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException("Invalid id");
    return parsed.data;
  }
}
