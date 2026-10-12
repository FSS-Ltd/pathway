import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { BehaviourCommandService } from "./behaviour-command.service";
import { BehaviourBatchService } from "./behaviour-batch.service";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { BehaviourQueryService } from "./behaviour-query.service";
import { BehaviourReviewService } from "./behaviour-review.service";
import { BehaviourRetractionService } from "./behaviour-retraction.service";
import { BehaviourTrendsService } from "./behaviour-trends.service";
import { DemeritStageService } from "./demerit-stage.service";
import {
  behaviourCorrectionSchema,
  behaviourListQuerySchema,
  behaviourRetractionSchema,
  behaviourTrendsQuerySchema,
  createBehaviourBatchSchema,
  createBehaviourEntrySchema,
} from "./dto/behaviour-entry.dto";
import { updateBehaviourPolicySchema } from "./dto/behaviour-policy.dto";
import {
  demeritOverrideSchema,
  demeritStatusQuerySchema,
  reviewRequestsQuerySchema,
} from "./dto/demerit-stage.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/behaviour")
export class BehaviourController {
  constructor(
    @Inject(BehaviourPolicyService)
    private readonly policyService: BehaviourPolicyService,
    @Inject(BehaviourCommandService)
    private readonly commandService: BehaviourCommandService,
    @Inject(BehaviourBatchService)
    private readonly batchService: BehaviourBatchService,
    @Inject(BehaviourQueryService)
    private readonly queryService: BehaviourQueryService,
    @Inject(DemeritStageService)
    private readonly demeritStageService: DemeritStageService,
    @Inject(BehaviourReviewService)
    private readonly reviewService: BehaviourReviewService,
    @Inject(BehaviourRetractionService)
    private readonly retractionService: BehaviourRetractionService,
    @Inject(BehaviourTrendsService)
    private readonly trendsService: BehaviourTrendsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("policy")
  @RequirePermission("ace.behaviour.read")
  get() {
    return this.policyService.get(this.actor());
  }

  @Put("policy")
  @RequirePermission("ace.behaviour.policy.manage")
  async update(@Body() body: unknown) {
    try {
      return await this.policyService.update(
        await updateBehaviourPolicySchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Get()
  @RequirePermission("ace.behaviour.read")
  async listEntries(@Query() query: unknown) {
    try {
      return await this.queryService.list(
        this.actor(),
        await behaviourListQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Get("trends")
  @RequirePermission("ace.behaviour.read")
  async trends(@Query() query: unknown) {
    try {
      return await this.trendsService.get(
        this.actor(),
        await behaviourTrendsQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Get("children/:childId/demerit-status")
  @RequirePermission("ace.behaviour.sensitive.read")
  async demeritStatus(
    @Param("childId") childId: string,
    @Query() query: unknown,
  ) {
    try {
      const parsedChildId = z.string().uuid().parse(childId);
      const { date } = await demeritStatusQuerySchema.parseAsync(query);
      return this.demeritStageService.status(this.actor(), parsedChildId, date);
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post("demerit-overrides")
  @RequirePermission("ace.behaviour.policy.manage")
  async createDemeritOverride(@Body() body: unknown) {
    try {
      return await this.demeritStageService.override(
        this.actor(),
        await demeritOverrideSchema.parseAsync(body),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Get("review-requests")
  @RequirePermission("ace.behaviour.sensitive.read")
  async reviewRequests(@Query() query: unknown) {
    try {
      return await this.reviewService.list(
        this.actor(),
        await reviewRequestsQuerySchema.parseAsync(query),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Get("review-requests/:requestId/fact")
  @RequirePermission("ace.behaviour.sensitive.read")
  async reviewFact(@Param("requestId") requestId: string) {
    try {
      return await this.reviewService.fact(
        this.actor(),
        z.string().uuid().parse(requestId),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new BadRequestException(error.flatten());
      throw error;
    }
  }

  @Post()
  @RequirePermission("ace.behaviour.record")
  async recordEntry(@Body() body: unknown) {
    try {
      return await this.commandService.record(
        await createBehaviourEntrySchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post("batch")
  @RequirePermission("ace.behaviour.record")
  async recordBatch(@Body() body: unknown) {
    try {
      return await this.batchService.record(
        await createBehaviourBatchSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post(":id/corrections")
  @RequirePermission("ace.behaviour.correct")
  async correctEntry(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.commandService.correct(
        id,
        await behaviourCorrectionSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  @Post(":id/retractions")
  @RequirePermission("ace.behaviour.policy.manage")
  async retractEntry(@Param("id") id: string, @Body() body: unknown) {
    try {
      return await this.retractionService.retract(
        id,
        await behaviourRetractionSchema.parseAsync(body),
        this.actor(),
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.flatten());
      }
      throw error;
    }
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
}
