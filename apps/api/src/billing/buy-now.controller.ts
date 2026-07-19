import {
  Body,
  Controller,
  Post,
  Req,
  Inject,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsUrl,
  ArrayUnique,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { Module } from "@pathway/db";
import { SECTOR_LABELS, type Sector } from "@pathway/types";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { BuyNowService } from "./buy-now.service";
import type {
  BuyNowCheckoutResponse,
  BuyNowOrgDetails,
  BuyNowPlanSelection,
  OrgPurchaseRequest,
} from "./buy-now.types";

class BuyNowPlanSelectionDto implements BuyNowPlanSelection {
  @IsString()
  @IsNotEmpty()
  planCode!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  av30AddonBlocks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraSites?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraStorageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraSmsMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraLeaderSeats?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(Module), { each: true })
  selectedModules?: Module[];
}

class BuyNowOrgDetailsDto implements BuyNowOrgDetails {
  @IsString()
  @IsNotEmpty()
  orgName!: string;

  @IsString()
  @IsNotEmpty()
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsIn(Object.keys(SECTOR_LABELS))
  sector!: Sector;

  @IsOptional()
  @IsString()
  source?: string;
}

class BuyNowCheckoutRequestDto {
  @ValidateNested()
  @Type(() => BuyNowPlanSelectionDto)
  plan!: BuyNowPlanSelectionDto;

  @ValidateNested()
  @Type(() => BuyNowOrgDetailsDto)
  org!: BuyNowOrgDetailsDto;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUrl()
  successUrl?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUrl()
  cancelUrl?: string;
}

class OrgPurchaseRequestDto implements OrgPurchaseRequest {
  @IsString()
  @IsNotEmpty()
  planCode!: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUrl()
  successUrl?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUrl()
  cancelUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  av30AddonBlocks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraSites?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraStorageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraSmsMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  extraLeaderSeats?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.values(Module), { each: true })
  selectedModules?: Module[];
}

/**
 * Public buy-now checkout endpoint.
 * No authentication required - this is for new customers purchasing for the first time.
 */
@Controller("billing/buy-now")
export class BuyNowController {
  constructor(@Inject(BuyNowService) private readonly buyNowService: BuyNowService) {}

  @Post("checkout")
  async checkout(
    @Body() body: BuyNowCheckoutRequestDto,
  ): Promise<BuyNowCheckoutResponse> {
    return this.buyNowService.checkout(body);
  }

  /**
   * Authenticated purchase endpoint for existing organisation admins.
   * Requires authentication and org admin role.
   * Prevents duplicate subscriptions and enforces upgrade-only logic.
   */
  @Post("purchase")
  @UseGuards(AuthUserGuard)
  async purchase(
    @Body() body: OrgPurchaseRequestDto,
    @Req() req: Request & {
      __pathwayContext?: { org?: { orgId?: string }; tenant?: { tenantId?: string }; user?: { userId?: string } };
      authUserId?: string;
    },
  ): Promise<BuyNowCheckoutResponse> {
    // Use context from request (set by AuthUserGuard) so org/user are always available after guard runs
    const ctx = req.__pathwayContext;
    const orgId = ctx?.org?.orgId ?? this.buyNowService["requestContext"]?.currentOrgId;
    const userId = (req as { authUserId?: string }).authUserId ?? ctx?.user?.userId ?? this.buyNowService["requestContext"]?.currentUserId;
    if (!orgId || !userId) {
      throw new ForbiddenException("Organisation context required");
    }
    return this.buyNowService.purchaseForOrg(body, {
      orgId,
      tenantId: ctx?.tenant?.tenantId,
      userId,
    });
  }
}
