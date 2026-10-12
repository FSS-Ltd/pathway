import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuthModule } from "../auth/auth.module";
import { CommonModule } from "../common/common.module";
import { MailerModule } from "../mailer/mailer.module";
import { BehaviourCommandService } from "./behaviour-command.service";
import { BehaviourPolicyService } from "./behaviour-policy.service";
import { BehaviourQueryService } from "./behaviour-query.service";
import { BehaviourController } from "./behaviour.controller";
import { DemeritEscalationService } from "./demerit-escalation.service";
import { BehaviourOutboxController } from "./behaviour-outbox.controller";

@Module({
  imports: [CommonModule, AuthModule, AccessControlModule, MailerModule],
  controllers: [BehaviourController, BehaviourOutboxController],
  providers: [
    BehaviourPolicyService,
    BehaviourCommandService,
    BehaviourQueryService,
    DemeritEscalationService,
  ],
})
export class BehaviourModule {}
