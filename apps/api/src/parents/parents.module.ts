import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { PublicSignupModule } from "../public-signup/public-signup.module";
import { ParentsController } from "./parents.controller";
import { ParentsService } from "./parents.service";

@Module({
  imports: [CommonModule, AuthModule, PublicSignupModule],
  controllers: [ParentsController],
  providers: [ParentsService],
  exports: [ParentsService],
})
export class ParentsModule {}
