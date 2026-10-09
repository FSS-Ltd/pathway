import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
  Inject,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SwapsService } from "./swaps.service";
import { createSwapDto, updateSwapDto } from "./dto";
import { SwapStatus } from "@pathway/db";
import { CurrentOrg, CurrentTenant } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  RotaAccessService,
  rotaActorFromRequest,
} from "../sessions/rota-access.service";

type AuthenticatedRequest = Request & {
  authUserId?: string;
  authIsSuperUser?: boolean;
};

const idParamSchema = z
  .string({ required_error: "id is required" })
  .uuid("id must be a valid uuid");

const listQueryDto = z.object({
  assignmentId: z.string().uuid().optional(),
  fromUserId: z.string().uuid().optional(),
  toUserId: z.string().uuid().optional(),
  status: z.nativeEnum(SwapStatus).optional(),
});

export type ListQueryDto = z.infer<typeof listQueryDto>;

@Controller("swaps")
@UseGuards(AuthUserGuard)
export class SwapsController {
  constructor(
    @Inject(SwapsService) private readonly swaps: SwapsService,
    @Inject(RotaAccessService) private readonly rotaAccess: RotaAccessService,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = createSwapDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const dto = parsed.data;
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    if (dto.status && dto.status !== SwapStatus.REQUESTED) {
      throw new BadRequestException("A new swap must be requested first");
    }
    if (
      dto.fromUserId !== actor.userId &&
      !(await this.rotaAccess.canManage(actor))
    ) {
      throw new ForbiddenException("You can only request your own swap");
    }
    return this.swaps.create(dto, tenantId);
  }

  @Get()
  async findAll(
    @Query() query: Record<string, unknown>,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = listQueryDto.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const filters = parsed.data;
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const manager = await this.rotaAccess.canManage(actor);
    if (
      !manager &&
      ((filters.fromUserId && filters.fromUserId !== actor.userId) ||
        (filters.toUserId && filters.toUserId !== actor.userId))
    ) {
      throw new ForbiddenException("Swap access is limited to your requests");
    }
    return this.swaps.findAll({
      ...filters,
      tenantId,
      participantUserId: manager ? undefined : actor.userId,
    });
  }

  @Get("candidates")
  async findCandidates(
    @Query("assignmentId") assignmentId: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = idParamSchema.safeParse(assignmentId);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    return this.swaps.findCandidates(parsed.data, actor.userId, tenantId);
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const validId = parsed.data;
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    const swap = await this.swaps.findOne(validId, tenantId);
    if (
      swap.fromUserId !== actor.userId &&
      swap.toUserId !== actor.userId &&
      !(await this.rotaAccess.canManage(actor))
    ) {
      throw new NotFoundException("SwapRequest not found");
    }
    return swap;
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      throw new BadRequestException(parsedId.error.issues);
    }
    const validId = parsedId.data;
    const parsedBody = updateSwapDto.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.issues);
    }
    const dto = parsedBody.data;
    const actor = rotaActorFromRequest(req, orgId, tenantId);
    if (!(await this.rotaAccess.canManage(actor))) {
      const swap = await this.swaps.findOne(validId, tenantId);
      const recipientDecision =
        swap.toUserId === actor.userId &&
        (dto.status === SwapStatus.ACCEPTED ||
          dto.status === SwapStatus.DECLINED);
      const requesterCancellation =
        swap.fromUserId === actor.userId && dto.status === SwapStatus.CANCELLED;
      if (dto.toUserId || (!recipientDecision && !requesterCancellation)) {
        throw new ForbiddenException("You cannot change this swap");
      }
    }
    return this.swaps.update(validId, dto, tenantId, orgId);
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const validId = parsed.data;
    await this.rotaAccess.assertManager(
      rotaActorFromRequest(req, orgId, tenantId),
    );
    return this.swaps.remove(validId, tenantId);
  }
}
