import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentOrg, CurrentTenant, CurrentUser } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FeedbackService } from "./feedback.service";
import { createFeedbackDto } from "./dto";

const parseOrBadRequest = async <T>(
  schema: z.ZodTypeAny,
  data: unknown,
): Promise<T> => {
  try {
    return await schema.parseAsync(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new BadRequestException(e.flatten());
    }
    throw e;
  }
};

/** Any authenticated admin-site user (staff or admin) may submit feedback. */
@UseGuards(AuthUserGuard)
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @CurrentOrg("orgId") orgId: string,
    @CurrentOrg("slug") orgSlug: string | undefined,
    @CurrentUser("userId") userId: string,
    @CurrentUser("email") email: string | undefined,
    @CurrentUser("givenName") displayName: string | undefined,
  ) {
    const dto = await parseOrBadRequest<typeof createFeedbackDto._output>(
      createFeedbackDto,
      body,
    );
    return this.service.create(dto, {
      tenantId,
      orgId,
      orgSlug,
      userId,
      email,
      displayName,
    });
  }
}
