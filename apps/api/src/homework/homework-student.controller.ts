import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import {
  homeworkDraftSchema,
  homeworkEvidenceIntentSchema,
  homeworkStudentIdSchema,
  homeworkSubmitSchema,
} from "./dto/homework-submission.dto";
import { HomeworkEvidenceService } from "./homework-evidence.service";
import { HomeworkSubmissionService } from "./homework-submission.service";

@UseGuards(AuthUserGuard)
@Controller("ace/student/sites/:siteId/homework")
export class HomeworkStudentController {
  constructor(
    @Inject(HomeworkSubmissionService)
    private readonly submissions: HomeworkSubmissionService,
    @Inject(HomeworkEvidenceService)
    private readonly evidence: HomeworkEvidenceService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  list(@Param("siteId") siteId: string) {
    return this.submissions.list(this.id(siteId), this.userId());
  }

  @Patch(":assignmentId/draft")
  saveDraft(
    @Param("siteId") siteId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = homeworkDraftSchema.safeParse(body);
    if (!input.success) throw new BadRequestException("Invalid homework draft");
    return this.submissions.saveDraft(
      this.id(siteId),
      this.userId(),
      this.id(assignmentId),
      input.data.text,
    );
  }

  @Post(":assignmentId/submit")
  @HttpCode(HttpStatus.OK)
  submit(
    @Param("siteId") siteId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = homeworkSubmitSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException("Invalid homework submission");
    return this.submissions.submit(
      this.id(siteId),
      this.userId(),
      this.id(assignmentId),
      input.data,
    );
  }

  @Post(":assignmentId/evidence-intents")
  issueIntent(
    @Param("siteId") siteId: string,
    @Param("assignmentId") assignmentId: string,
    @Body() body: unknown,
  ) {
    const input = homeworkEvidenceIntentSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException("Invalid evidence upload");
    return this.evidence.issueIntent(
      this.id(siteId),
      this.userId(),
      this.id(assignmentId),
      input.data,
    );
  }

  @Post(":assignmentId/evidence-intents/:evidenceId/complete")
  @HttpCode(HttpStatus.OK)
  completeIntent(
    @Param("siteId") siteId: string,
    @Param("assignmentId") assignmentId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.evidence.completeIntent(
      this.id(siteId),
      this.userId(),
      this.id(assignmentId),
      this.id(evidenceId),
    );
  }

  private id(value: string): string {
    const result = homeworkStudentIdSchema.safeParse(value);
    if (!result.success)
      throw new BadRequestException("Invalid homework identifier");
    return result.data;
  }

  private userId(): string {
    return this.requestContext.requireContext().user.userId;
  }
}
