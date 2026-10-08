import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { SafeguardingModule } from "../common/safeguarding/safeguarding.module";
import { AuditModule } from "../audit/audit.module";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  imports: [
    CommonModule,
    AuditModule,
    SafeguardingModule,
    AuthModule,
    AccessControlModule,
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
