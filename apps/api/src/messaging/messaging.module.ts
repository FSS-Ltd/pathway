import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MailerModule } from "../mailer/mailer.module";
import { MessageEmailDispatchService } from "./message-email-dispatch.service";
import {
  ParentMessageEmailPreferencesController,
  StaffMessageEmailPreferencesController,
} from "./message-email-preferences.controller";
import { MessageEmailPreferencesService } from "./message-email-preferences.service";
import { MessageEmailRunnerController } from "./message-email-runner.controller";
import { MessageEmailRunnerService } from "./message-email-runner.service";
import { MessagingController } from "./messaging.controller";
import { MessagingBoundaryAuditInterceptor } from "./messaging-boundary-audit.interceptor";
import { MessagingCommandService } from "./messaging-command.service";
import { MessagingConversationService } from "./messaging-conversation.service";
import { MessagingService } from "./messaging.service";
import { MessageRealtimePublisher } from "./message-realtime.publisher";
import { ParentMessagingController } from "./parent-messaging.controller";
import { ParentMessagingCommandService } from "./parent-messaging-command.service";
import { ParentMessagingConversationService } from "./parent-messaging-conversation.service";
import { ParentMessagingHistoryService } from "./parent-messaging-history.service";
import { ParentMessagingReadCursorService } from "./parent-messaging-read-cursor.service";
import { ParentMessagingService } from "./parent-messaging.service";
import { StaffSchoolTeamHistoryService } from "./staff-school-team-history.service";
import { StaffSchoolTeamReadCursorService } from "./staff-school-team-read-cursor.service";
import { StaffSchoolTeamCommandService } from "./staff-school-team-command.service";
import { StaffSchoolTeamService } from "./staff-school-team.service";
import {
  ParentRealtimeTokenController,
  StaffRealtimeTokenController,
} from "../realtime/realtime-token.controller";
import { RealtimeTokenService } from "../realtime/realtime-token.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, MailerModule],
  controllers: [
    MessagingController,
    ParentMessagingController,
    StaffMessageEmailPreferencesController,
    ParentMessageEmailPreferencesController,
    MessageEmailRunnerController,
    StaffRealtimeTokenController,
    ParentRealtimeTokenController,
  ],
  providers: [
    MessageEmailPreferencesService,
    MessageEmailDispatchService,
    MessageEmailRunnerService,
    MessagingBoundaryAuditInterceptor,
    MessagingService,
    MessagingConversationService,
    MessagingCommandService,
    StaffSchoolTeamService,
    StaffSchoolTeamHistoryService,
    StaffSchoolTeamReadCursorService,
    StaffSchoolTeamCommandService,
    ParentMessagingService,
    ParentMessagingCommandService,
    ParentMessagingConversationService,
    ParentMessagingHistoryService,
    ParentMessagingReadCursorService,
    RealtimeTokenService,
    MessageRealtimePublisher,
  ],
  exports: [ParentMessagingService],
})
export class MessagingModule {}
