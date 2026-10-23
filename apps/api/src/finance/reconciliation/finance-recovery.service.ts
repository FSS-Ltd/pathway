import { Inject, Injectable } from "@nestjs/common";
import {
  FINANCE_STRIPE_SERVICING_CONFIG,
  type FinanceStripeServicingConfig,
} from "../stripe/finance-stripe-servicing.config";
import type { FinanceRecoveryRequest } from "./finance-recovery.contracts";
import { FinanceReconciliationStateRepository } from "./finance-reconciliation-state.repository";
import {
  runFinanceRecoveryRequest,
  type FinanceRecoveryResult,
} from "./finance-recovery-runtime";

@Injectable()
export class FinanceRecoveryService {
  constructor(
    @Inject(FINANCE_STRIPE_SERVICING_CONFIG)
    private readonly config: FinanceStripeServicingConfig,
    @Inject(FinanceReconciliationStateRepository)
    private readonly states: FinanceReconciliationStateRepository,
  ) {}
  run(input: FinanceRecoveryRequest): Promise<FinanceRecoveryResult> {
    return runFinanceRecoveryRequest(input, this.config, {
      states: this.states,
    });
  }
}
