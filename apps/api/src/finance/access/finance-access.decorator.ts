import { applyDecorators, SetMetadata } from "@nestjs/common";
import { RequirePermission } from "../../access-control/require-permission.decorator";
import {
  FINANCE_ACCESS_REQUIREMENT,
  type FinanceAccessRequirement,
} from "./finance-access.types";

export function RequireFinanceAccess(
  requirement: FinanceAccessRequirement,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(FINANCE_ACCESS_REQUIREMENT, requirement),
    RequirePermission(requirement.permission),
  );
}
