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
import { AceNoticeDraftsService } from "./ace-notice-drafts.service";
import {
  createNoticeDraftSchema,
  listNoticeDraftsSchema,
  noticeDraftIdSchema,
  updateNoticeDraftSchema,
} from "./dto/ace-notice-draft.dto";

@UseGuards(AuthUserGuard, PermissionGuard)
@Controller("ace/notices/drafts")
export class AceNoticeDraftsController {
  constructor(
    @Inject(AceNoticeDraftsService)
    private readonly service: AceNoticeDraftsService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post()
  @RequirePermission("notices.manage")
  create(@Body() body: unknown) {
    return this.service.create(
      this.parse(createNoticeDraftSchema, body),
      this.actor(),
    );
  }

  @Get()
  @RequirePermission("notices.manage")
  list(@Query() query: unknown) {
    return this.service.list(
      this.parse(listNoticeDraftsSchema, query),
      this.actor(),
    );
  }

  @Get(":id")
  @RequirePermission("notices.manage")
  get(@Param("id") id: string) {
    return this.service.get(this.parse(noticeDraftIdSchema, id), this.actor());
  }

  @Put(":id")
  @RequirePermission("notices.manage")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.service.update(
      this.parse(noticeDraftIdSchema, id),
      this.parse(updateNoticeDraftSchema, body),
      this.actor(),
    );
  }

  private actor() {
    const context = this.requestContext.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
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
