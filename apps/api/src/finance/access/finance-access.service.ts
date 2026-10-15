import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import {
  FINANCE_ACCESS_READER,
  type FinanceAccessReader,
  type FinanceAccessScope,
} from "./finance-access.reader";
import {
  canPerformFinancePayerAction,
  canPerformFinanceStaffAction,
  isIndependentFinanceApproval,
  resolveFinanceAccessMode,
} from "./finance-access.policy";
import type {
  FinanceAccessMode,
  FinancePayerAction,
  FinanceStaffAction,
} from "./finance-access.types";

@Injectable()
export class FinanceAccessService {
  constructor(
    @Inject(FINANCE_ACCESS_READER)
    private readonly reader: FinanceAccessReader,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async resolveMode(scope: FinanceAccessScope): Promise<FinanceAccessMode> {
    const module = await this.reader.findModule(scope);
    return resolveFinanceAccessMode(module);
  }

  async assertStaffAction(
    scope: FinanceAccessScope,
    action: FinanceStaffAction,
  ): Promise<void> {
    const mode = await this.resolveMode(scope);
    if (!canPerformFinanceStaffAction(mode, action)) {
      throw new ForbiddenException("Finance action unavailable");
    }
  }

  async assertPayerAction(
    scope: FinanceAccessScope,
    payerUserId: string,
    payerAccountId: string,
    action: FinancePayerAction,
  ): Promise<void> {
    const mode = await this.resolveMode(scope);
    if (
      !canPerformFinancePayerAction(mode, action) ||
      !payerAccountId ||
      !(await this.reader.hasPayerGrant(scope, payerAccountId, payerUserId))
    ) {
      throw new ForbiddenException("Finance access unavailable");
    }
  }

  async authorizeAutomatedDebitApproval(
    scope: FinanceAccessScope,
    requesterUserId: string,
    approverUserId: string,
  ): Promise<void> {
    if (!isIndependentFinanceApproval(requesterUserId, approverUserId)) {
      throw new ForbiddenException("Independent Finance approval required");
    }
    await this.assertStaffAction(scope, "APPROVE_AUTOMATED_DEBIT");
    const decision = await this.permissions.resolve({
      userId: approverUserId,
      orgId: scope.orgId,
      tenantId: scope.tenantId,
      permission: "finance.approvals.review",
      now: new Date(),
    });
    if (!decision.allowed) {
      throw new ForbiddenException("Finance approval permission required");
    }
  }

  /** Call after webhook signature verification and durable inbox persistence. */
  async assertExistingReceiptCanBeServiced(
    scope: FinanceAccessScope,
    receiptId: string,
  ): Promise<void> {
    if (!receiptId || !(await this.reader.hasReceipt(scope, receiptId))) {
      throw new ForbiddenException("Finance evidence target unavailable");
    }
  }
}
