import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import {
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import { financeProfileSettingsSchema } from "./dto/finance-profile.dto";
import { FinanceProfileService } from "./finance-profile.service";

@Controller("finance/profile")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceProfileController {
  constructor(
    @Inject(FinanceProfileService)
    private readonly profiles: FinanceProfileService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get()
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.payments.read",
  })
  getSettings() {
    return this.profiles.getSettings(financeRequestActor(this.requestContext));
  }

  @Patch()
  @RequireFinanceAccess({
    kind: "staff",
    action: "MANAGE_COLLECTION_ACCOUNT",
    permission: "finance.payments.manage",
  })
  saveSettings(@Body() body: unknown) {
    return this.profiles.saveSettings(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeProfileSettingsSchema, body),
    );
  }
}
