import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { HomeworkReviewService } from "./homework-review.service";
import { reviewSubmissionSchema } from "./dto/review-submission.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/homework/reviews")
export class HomeworkReviewController {
  constructor(
    @Inject(HomeworkReviewService)
    private readonly service: HomeworkReviewService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequirePermission("ace.homework.reviews.manage")
  list() {
    const context = this.requestContext.requireContext();
    return this.service.list({
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.homework.reviews.manage")
  review(@Body() body: unknown) {
    const parsed = reviewSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Invalid homework review");
    }
    const context = this.requestContext.requireContext();
    return this.service.review(parsed.data, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }

  @Post(":reviewId/release")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("ace.homework.reviews.manage")
  release(@Param("reviewId") reviewId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        reviewId,
      )
    ) {
      throw new BadRequestException("Invalid homework review");
    }
    const context = this.requestContext.requireContext();
    return this.service.release(reviewId, {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    });
  }
}
