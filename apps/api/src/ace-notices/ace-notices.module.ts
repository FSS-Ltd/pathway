import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { AceNoticeDraftsController } from "./ace-notice-drafts.controller";
import { AceNoticeDraftsService } from "./ace-notice-drafts.service";
import { AceNoticePublicationController } from "./ace-notice-publication.controller";
import { AceNoticePublicationService } from "./ace-notice-publication.service";
import { AceNoticeReceiptSummaryService } from "./ace-notice-receipt-summary.service";
import { AceNoticeParentInboxController } from "./ace-notice-parent-inbox.controller";
import { AceNoticeParentInboxService } from "./ace-notice-parent-inbox.service";
import { AceNoticeStaffInboxController } from "./ace-notice-staff-inbox.controller";
import { AceNoticeStaffInboxService } from "./ace-notice-staff-inbox.service";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [
    AceNoticeDraftsController,
    AceNoticePublicationController,
    AceNoticeParentInboxController,
    AceNoticeStaffInboxController,
  ],
  providers: [
    AceNoticeDraftsService,
    AceNoticePublicationService,
    AceNoticeReceiptSummaryService,
    AceNoticeParentInboxService,
    AceNoticeStaffInboxService,
  ],
})
export class AceNoticesModule {}
