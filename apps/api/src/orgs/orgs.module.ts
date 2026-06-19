import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { BillingModule } from "../billing/billing.module";
import { AuthModule } from "../auth/auth.module";
import { OrgsController } from "./orgs.controller";
import { OrgsService } from "./orgs.service";
import { OrgPeopleService } from "./org-people.service";

@Module({
  imports: [CommonModule, BillingModule, AuthModule],
  controllers: [OrgsController],
  providers: [OrgsService, OrgPeopleService],
  exports: [OrgsService, OrgPeopleService],
})
export class OrgsModule {}
