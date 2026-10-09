import {
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { DemeritEscalationService } from "./demerit-escalation.service";

const INTERNAL_SECRET_HEADER = "x-pathway-internal-secret";

@Controller("internal/outbox")
export class BehaviourOutboxController {
  constructor(
    @Inject(DemeritEscalationService)
    private readonly demeritEscalation: DemeritEscalationService,
  ) {}

  @Post("behaviour")
  dispatch(
    @Body() body: unknown,
    @Headers(INTERNAL_SECRET_HEADER) providedSecret?: string,
  ): Promise<{ sent: number }> {
    const expectedSecret = process.env.BEHAVIOUR_OUTBOX_SECRET;
    if (!expectedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException("Invalid internal auth secret");
    }
    return this.demeritEscalation.dispatch(body);
  }
}
