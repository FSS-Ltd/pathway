import { Module } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { SafeguardingGuard } from "./safeguarding.guard";

@Module({
  imports: [PathwayAuthModule],
  providers: [SafeguardingGuard],
  exports: [SafeguardingGuard],
})
export class SafeguardingModule {}

