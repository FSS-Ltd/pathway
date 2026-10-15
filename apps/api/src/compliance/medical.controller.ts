import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { complianceIdSchema } from "./compliance.dto";
import { medicalListSchema, medicalUpdateSchema } from "./medical.dto";
import { MedicalService } from "./medical.service";

function parse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("compliance/medical")
export class MedicalController {
  constructor(
    @Inject(MedicalService) private readonly service: MedicalService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}

  private actor() {
    const context = this.context.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.medical.read")
  list(@Query() query: unknown) {
    return this.service.list(
      parse(medicalListSchema, query).cursor,
      this.actor(),
    );
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.medical.read")
  get(@Param("id") id: string) {
    return this.service.get(parse(complianceIdSchema, id), this.actor());
  }

  @Get(":id/export")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.medical.manage")
  exportRecord(@Param("id") id: string) {
    return this.service.exportRecord(
      parse(complianceIdSchema, id),
      this.actor(),
    );
  }

  @Patch(":id")
  @Header("Cache-Control", "private, no-store")
  @RequirePermission("compliance.medical.manage")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.service.update(
      parse(complianceIdSchema, id),
      parse(medicalUpdateSchema, body),
      this.actor(),
    );
  }
}
