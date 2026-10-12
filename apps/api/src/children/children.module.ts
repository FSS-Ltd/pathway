import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { InvitesModule } from "../invites/invites.module";
import { ChildrenController } from "./children.controller";
import { ChildrenService } from "./children.service";

@Module({
  imports: [CommonModule, AuthModule, InvitesModule],
  controllers: [ChildrenController],
  providers: [ChildrenService],
  exports: [ChildrenService],
})
export class ChildrenModule {}
