import { ServiceUnavailableException } from "@nestjs/common";

export function assertDeclaredCapacityBillingEnabled(): void {
  if (process.env.DECLARED_CAPACITY_BILLING_ENABLED !== "true") {
    throw new ServiceUnavailableException({
      code: "DECLARED_CAPACITY_BILLING_UNAVAILABLE",
    });
  }
}
