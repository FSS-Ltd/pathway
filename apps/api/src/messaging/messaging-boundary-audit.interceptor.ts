import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { catchError, throwError, type Observable } from "rxjs";
import {
  LoggingService,
  type StructuredLogger,
} from "../common/logging/logging.service";

@Injectable()
export class MessagingBoundaryAuditInterceptor implements NestInterceptor {
  private readonly logger: StructuredLogger;

  constructor(
    @Inject(LoggingService) logging: LoggingService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {
    this.logger = logging.createLogger(MessagingBoundaryAuditInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (
          error instanceof NotFoundException ||
          error instanceof ForbiddenException
        ) {
          const actor = this.requestContext.getContext();
          this.logger.warn("messaging-boundary-denied", {
            orgId: actor?.org.orgId,
            tenantId: actor?.tenant.tenantId,
            actorUserId: actor?.user.userId,
            operation: `${context.getClass().name}.${context.getHandler().name}`,
            status: error.getStatus(),
          });
        }
        return throwError(() => error);
      }),
    );
  }
}
