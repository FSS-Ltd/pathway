import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MessagingController } from "./messaging.controller";
import { MessagingQueryService } from "./messaging-query.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [MessagingController],
  providers: [MessagingQueryService],
})
export class MessagingModule {}
