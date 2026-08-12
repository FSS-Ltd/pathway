import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { BehaviourController } from "./behaviour.controller";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule],
  controllers: [BehaviourController],
  providers: [BehaviourPolicyService],
})
export class BehaviourModule {}
