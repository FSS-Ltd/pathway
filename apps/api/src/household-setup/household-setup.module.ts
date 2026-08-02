import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { HouseholdSetupController } from "./household-setup.controller";
import { HouseholdSetupService } from "./household-setup.service";

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [HouseholdSetupController],
  providers: [HouseholdSetupService],
})
export class HouseholdSetupModule {}
