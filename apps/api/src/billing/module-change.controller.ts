import {
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
import { CurrentOrg } from "@pathway/auth";
import { Module } from "@pathway/db";
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import {
  ModuleChangeService,
  type ModuleChangePreview,
} from "./module-change.service";

class PreviewModuleChangeDto {
  @IsString()
  planCode!: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(Module), { each: true })
  includedModules!: Module[];

  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(Module), { each: true })
  paidModules!: Module[];
}

class AcceptModuleChangeDto {
  @IsUUID()
  changeId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}

@IndependentTransaction()
@UseGuards(AuthUserGuard)
@Controller("billing/module-changes")
export class ModuleChangeController {
  constructor(
    @Inject(ModuleChangeService) private readonly service: ModuleChangeService,
  ) {}

  private async authorize(
    orgId: string,
    req: { authUserId?: string },
  ): Promise<void> {
    if (!req.authUserId)
      throw new UnauthorizedException("User context required.");
    await this.service.ensureOrgAdmin(orgId, req.authUserId);
  }

  @Post("preview")
  async preview(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: PreviewModuleChangeDto,
  ): Promise<ModuleChangePreview> {
    await this.authorize(orgId, req);
    return this.service.preview(orgId, body);
  }

  @Post("accept")
  async accept(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Body() body: AcceptModuleChangeDto,
  ): Promise<ModuleChangePreview> {
    await this.authorize(orgId, req);
    return this.service.accept(orgId, body.changeId, body.idempotencyKey);
  }

  @Get(":id")
  async get(
    @CurrentOrg("orgId") orgId: string,
    @Req() req: { authUserId?: string },
    @Param("id") id: string,
  ): Promise<ModuleChangePreview> {
    await this.authorize(orgId, req);
    return this.service.get(orgId, id);
  }
}
