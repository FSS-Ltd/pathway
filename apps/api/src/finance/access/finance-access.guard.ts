import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import type { FinanceAccessScope } from "./finance-access.reader";
import { FinanceAccessService } from "./finance-access.service";
import {
  FINANCE_ACCESS_REQUIREMENT,
  type FinanceAccessRequirement,
} from "./finance-access.types";

interface RequestWithParams {
  params?: Record<string, string | undefined>;
}

@Injectable()
export class FinanceAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<FinanceAccessRequirement>(
        FINANCE_ACCESS_REQUIREMENT,
        [context.getHandler(), context.getClass()],
      );
    if (!requirement) return true;

    const requestContext = this.requestContext.getContext();
    const scope = getFinanceScope(requestContext);
    const userId = requestContext?.user.userId;
    if (!scope || !userId) {
      throw new ForbiddenException("Finance access unavailable");
    }

    if (requirement.kind === "staff") {
      await this.financeAccess.assertStaffAction(scope, requirement.action);
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithParams>();
    const payerAccountId = request.params?.[requirement.accountParam];
    if (!payerAccountId) {
      throw new ForbiddenException("Finance access unavailable");
    }
    await this.financeAccess.assertPayerAction(
      scope,
      userId,
      payerAccountId,
      requirement.action,
    );
    return true;
  }
}

function getFinanceScope(
  context: ReturnType<PathwayRequestContext["getContext"]>,
): FinanceAccessScope | null {
  const tenantId = context?.tenant.tenantId;
  const orgId = context?.org.orgId;
  if (!tenantId || !orgId) return null;
  return { tenantId, orgId };
}
