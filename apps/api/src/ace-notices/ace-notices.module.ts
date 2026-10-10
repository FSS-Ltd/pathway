import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AceNoticeDraftsController } from "./ace-notice-drafts.controller";
import { AceNoticeDraftsService } from "./ace-notice-drafts.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [AceNoticeDraftsController],
  providers: [AceNoticeDraftsService],
})
export class AceNoticesModule {}
