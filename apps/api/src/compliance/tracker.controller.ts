import { TrackerHistoryService } from "./tracker-history.service";
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { TrackerService } from "./tracker.service";
import { TrackerProfileService } from "./tracker-profile.service";
import { TrackerEvidenceService } from "./tracker-evidence.service";
import { TrackerSignalsService } from "./tracker-signals.service";
import {
  parseTracker,
  trackerId,
  trackerArchiveInput,
  trackerProfileUpdate,
  trackerAttestationInput,
  trackerEvidenceInput,
  trackerPageQuery,
  trackerHistoryIndexQuery,
} from "./tracker.dto";
@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("compliance/tracker")
export class TrackerController {
  constructor(
    @Inject(TrackerHistoryService)
    private readonly historyIndex: TrackerHistoryService,
    @Inject(TrackerService) private readonly service: TrackerService,
    @Inject(TrackerProfileService)
    private readonly profiles: TrackerProfileService,
    @Inject(TrackerEvidenceService)
    private readonly evidence: TrackerEvidenceService,
    @Inject(TrackerSignalsService)
    private readonly signals: TrackerSignalsService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}
  private actor() {
    const c = this.context.requireContext();
    return {
      tenantId: c.tenant.tenantId,
      orgId: c.org.orgId,
      userId: c.user.userId,
    };
  }
  @Get("jurisdictions")
  @Header("Cache-Control", "private, no-store")
  jurisdictions() {
    return this.profiles.jurisdictions(this.actor());
  }
  @Get("profile")
  @Header("Cache-Control", "private, no-store")
  profile() {
    return this.profiles.get(this.actor());
  }
  @Put("profile")
  @Header("Cache-Control", "private, no-store")
  save(@Body() body: unknown) {
    return this.profiles.save(
      this.actor(),
      parseTracker(trackerProfileUpdate, body),
    );
  }
  @Get("checklist")
  @Header("Cache-Control", "private, no-store")
  checklist() {
    return this.service.checklist(this.actor());
  }
  @Post("attestations")
  @Header("Cache-Control", "private, no-store")
  attest(@Body() body: unknown) {
    return this.service.attest(
      this.actor(),
      parseTracker(trackerAttestationInput, body),
    );
  }
  @Get("history/requirements")
  @Header("Cache-Control", "private, no-store")
  historicalRequirements(@Query() query: unknown) {
    return this.historyIndex.requirements(
      this.actor(),
      parseTracker(trackerHistoryIndexQuery, query).cursor,
    );
  }
  @Get("history")
  @Header("Cache-Control", "private, no-store")
  history(@Query() query: unknown) {
    const q = parseTracker(trackerPageQuery, query);
    return this.service.history(this.actor(), q.requirementId, q.cursor);
  }
  @Get("signals")
  @Header("Cache-Control", "private, no-store")
  observations() {
    return this.signals.read(this.actor());
  }
  @Get("evidence")
  @Header("Cache-Control", "private, no-store")
  listEvidence(@Query() query: unknown) {
    const q = parseTracker(trackerPageQuery, query);
    return this.evidence.list(this.actor(), q.requirementId, q.cursor);
  }
  @Post("evidence")
  @Header("Cache-Control", "private, no-store")
  upload(@Body() body: unknown) {
    return this.evidence.create(
      this.actor(),
      parseTracker(trackerEvidenceInput, body),
    );
  }
  @Post("evidence/:id/archive")
  @Header("Cache-Control", "private, no-store")
  archive(@Param("id") id: string, @Body() body: unknown) {
    parseTracker(trackerArchiveInput, body);
    return this.evidence.archive(this.actor(), parseTracker(trackerId, id));
  }
  @Get("evidence/:id/file")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async file(@Param("id") id: string) {
    const file = await this.evidence.file(
      this.actor(),
      parseTracker(trackerId, id),
    );
    const fallback = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new StreamableFile(file.bytes, {
      type: "application/pdf",
      disposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      length: file.bytes.length,
    });
  }
}
