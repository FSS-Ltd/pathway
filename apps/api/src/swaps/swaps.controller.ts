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
  UseGuards,
  Inject,
} from "@nestjs/common";
import { z } from "zod";

import { SwapsService } from "./swaps.service";
import { createSwapDto, updateSwapDto } from "./dto";
import { SwapStatus } from "@pathway/db";
import { CurrentTenant } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";

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
  constructor(@Inject(SwapsService) private readonly swaps: SwapsService) {}

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = createSwapDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const dto = parsed.data;
    return this.swaps.create(dto, tenantId);
  }

  @Get()
  async findAll(
    @Query() query: Record<string, unknown>,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = listQueryDto.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const filters = parsed.data;
    return this.swaps.findAll({ ...filters, tenantId });
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const validId = parsed.data;
    return this.swaps.findOne(validId, tenantId);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
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
    return this.swaps.update(validId, dto, tenantId);
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
  ) {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const validId = parsed.data;
    return this.swaps.remove(validId, tenantId);
  }
}
