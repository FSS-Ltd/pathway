import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { PermissionGuard } from "../../access-control/permission.guard";
import type { FinanceAccessScope } from "./finance-access.reader";
import { RequireFinanceAccess } from "./finance-access.decorator";
import { FinanceAccessGuard } from "./finance-access.guard";
import { FinancePayerGrantService } from "./finance-payer-grant.service";
import { CreateFinancePayerGrantDto } from "./dto/create-finance-payer-grant.dto";

interface FinanceActor {
  scope: FinanceAccessScope;
  userId: string;
}

@Controller("finance/payer-accounts/:payerAccountId/access-grants")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinancePayerGrantController {
  constructor(
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
    @Inject(FinancePayerGrantService)
    private readonly payerGrants: FinancePayerGrantService,
  ) {}

  @Post()
  @RequireFinanceAccess({
    kind: "staff",
    action: "GRANT_PAYER_ACCESS",
    permission: "finance.payer_access.manage",
  })
  grant(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Body() input: CreateFinancePayerGrantDto,
  ) {
    const actor = this.requireActor();
    return this.payerGrants.grant(
      actor.scope,
      payerAccountId,
      input.payerUserId,
      actor.userId,
    );
  }

  @Delete(":grantId")
  @HttpCode(HttpStatus.OK)
  @RequireFinanceAccess({
    kind: "staff",
    action: "REVOKE_PAYER_ACCESS",
    permission: "finance.payer_access.manage",
  })
  async revoke(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
  ): Promise<{ revoked: true }> {
    const actor = this.requireActor();
    await this.payerGrants.revoke(
      actor.scope,
      payerAccountId,
      grantId,
      actor.userId,
    );
    return { revoked: true };
  }

  private requireActor(): FinanceActor {
    const context = this.requestContext.getContext();
    const tenantId = context?.tenant.tenantId;
    const orgId = context?.org.orgId;
    const userId = context?.user.userId;
    if (!tenantId || !orgId || !userId) {
      throw new ForbiddenException("Finance access unavailable");
    }
    return { scope: { tenantId, orgId }, userId };
  }
}
