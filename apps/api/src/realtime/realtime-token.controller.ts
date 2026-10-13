import {
  Controller,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import type { MessageRealtimeSubscription } from "@pathway/platform";
import { PermissionGuard } from "../access-control/permission.guard";
import { RequirePermission } from "../access-control/require-permission.decorator";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { MessagingBoundaryAuditInterceptor } from "../messaging/messaging-boundary-audit.interceptor";
import { RequireCapability } from "../platform/capability.decorator";
import { CapabilityGuard } from "../platform/capability.guard";
import { RealtimeTokenService } from "./realtime-token.service";

@UseGuards(AuthUserGuard, CapabilityGuard, PermissionGuard)
@UseInterceptors(MessagingBoundaryAuditInterceptor)
@Controller("ace/messages/conversations")
export class StaffRealtimeTokenController {
  constructor(
    @Inject(RealtimeTokenService) private readonly tokens: RealtimeTokenService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post(":id/realtime-token")
  @Header("Cache-Control", "no-store")
  @RequireCapability("messaging.messages.read")
  @RequirePermission("messaging.messages.read")
  issueStaff(
    @Param("id", new ParseUUIDPipe()) conversationId: string,
  ): Promise<MessageRealtimeSubscription> {
    return this.tokens.issueStaff(this.actor(), conversationId, "staff");
  }

  @Post("school-team/:id/realtime-token")
  @Header("Cache-Control", "no-store")
  @RequireCapability("messaging.messages.read")
  @RequirePermission("messaging.messages.read")
  issueSchoolTeam(
    @Param("id", new ParseUUIDPipe()) conversationId: string,
  ): Promise<MessageRealtimeSubscription> {
    return this.tokens.issueStaff(this.actor(), conversationId, "school-team");
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

@UseGuards(AuthUserGuard)
@UseInterceptors(MessagingBoundaryAuditInterceptor)
@IndependentTransaction()
@Controller("ace/parent/sites/:siteId/messages/conversations")
export class ParentRealtimeTokenController {
  constructor(
    @Inject(RealtimeTokenService) private readonly tokens: RealtimeTokenService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Post(":id/realtime-token")
  @Header("Cache-Control", "no-store")
  issue(
    @Param("siteId", new ParseUUIDPipe()) siteId: string,
    @Param("id", new ParseUUIDPipe()) conversationId: string,
  ): Promise<MessageRealtimeSubscription> {
    return this.tokens.issueParent(
      siteId,
      this.requestContext.requireContext().user.userId,
      conversationId,
    );
  }
}
