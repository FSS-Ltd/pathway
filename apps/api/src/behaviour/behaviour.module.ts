import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { BehaviourCommandService } from "./behaviour-command.service";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { BehaviourQueryService } from "./behaviour-query.service";
import { BehaviourController } from "./behaviour.controller";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [BehaviourController],
  providers: [
    BehaviourPolicyService,
    BehaviourCommandService,
    BehaviourQueryService,
  ],
})
export class BehaviourModule {}
