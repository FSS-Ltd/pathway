import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MessagingController } from "./messaging.controller";
import { MessagingCommandService } from "./messaging-command.service";
import { MessagingConversationService } from "./messaging-conversation.service";
import { MessagingService } from "./messaging.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingConversationService,
    MessagingCommandService,
  ],
})
export class MessagingModule {}
