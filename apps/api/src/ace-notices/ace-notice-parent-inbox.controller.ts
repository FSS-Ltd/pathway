import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { AceNoticeParentInboxService } from "./ace-notice-parent-inbox.service";
import { noticeDraftIdSchema } from "./dto/ace-notice-draft.dto";
import { listNoticeInboxSchema } from "./dto/ace-notice-inbox.dto";

@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/notices")
export class AceNoticeParentInboxController {
  constructor(
    @Inject(AceNoticeParentInboxService)
    private readonly service: AceNoticeParentInboxService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string, @Query() query: unknown) {
    return this.service.list(
      siteId,
      this.userId(),
      this.parse(listNoticeInboxSchema, query),
    );
  }

  @Get(":id")
  get(@Param("siteId") siteId: string, @Param("id") id: string) {
    return this.service.get(
      siteId,
      this.userId(),
      this.parse(noticeDraftIdSchema, id),
    );
  }

  @Post(":id/read")
  markRead(@Param("siteId") siteId: string, @Param("id") id: string) {
    return this.service.markRead(
      siteId,
      this.userId(),
      this.parse(noticeDraftIdSchema, id),
    );
  }

  private userId(): string {
    return this.requestContext.requireContext().user.userId;
  }

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  }
}
