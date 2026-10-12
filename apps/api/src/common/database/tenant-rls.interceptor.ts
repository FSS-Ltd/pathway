import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { from, lastValueFrom } from "rxjs";

interface RequestWithContext {
  __pathwayContext?: {
    tenant?: { tenantId?: string };
    org?: { orgId?: string };
  };
}

/**
 * RLS Interceptor that sets tenant context for database queries.
 * Reads tenant/org from the __pathwayContext set by AuthUserGuard.
 */
@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const pathwayContext = request.__pathwayContext;

    if (!pathwayContext?.tenant?.tenantId) {
      // No tenant context - skip RLS (e.g., for org-level or public endpoints)
      return next.handle();
    }

    const tenantId = pathwayContext.tenant.tenantId;
    const orgId = pathwayContext.org?.orgId || null;

    return from(
      withTenantRlsContext(tenantId, orgId, async () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}

