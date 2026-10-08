import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MessagingController } from "./messaging.controller";
import { MessagingCommandService } from "./messaging-command.service";
import { MessagingConversationService } from "./messaging-conversation.service";
import { MessagingService } from "./messaging.service";
import { ParentMessagingController } from "./parent-messaging.controller";
import { ParentMessagingHistoryService } from "./parent-messaging-history.service";
import { ParentMessagingReadCursorService } from "./parent-messaging-read-cursor.service";
import { ParentMessagingService } from "./parent-messaging.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [MessagingController, ParentMessagingController],
  providers: [
    MessagingService,
    MessagingConversationService,
    MessagingCommandService,
    ParentMessagingService,
    ParentMessagingHistoryService,
    ParentMessagingReadCursorService,
  ],
})
export class MessagingModule {}
