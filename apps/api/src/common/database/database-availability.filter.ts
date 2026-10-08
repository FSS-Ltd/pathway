import { ArgumentsHost, Catch, Logger } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import { Prisma } from "@pathway/db";
import {
  getOrCreateRequestId,
  type RequestWithRequestId,
} from "../../access-control/request-id";

const RETRYABLE_DATABASE_CODES = new Set(["P1001", "P1002", "P2024"]);

function retryableDatabaseCode(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_DATABASE_CODES.has(error.code) ? error.code : null;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode && RETRYABLE_DATABASE_CODES.has(error.errorCode)
      ? error.errorCode
      : null;
  }
  return null;
}

/** Keep connection errors out of responses while preserving a support reference. */
@Catch()
export class DatabaseAvailabilityFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(DatabaseAvailabilityFilter.name);

  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const code = retryableDatabaseCode(exception);
    if (!code) {
      super.catch(exception, host);
      return;
    }

    const http = host.switchToHttp();
    const requestId = getOrCreateRequestId(
      http.getRequest<RequestWithRequestId>(),
    );
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: unknown): void };
    }>();
    this.logger.error({
      message: "Database unavailable during request",
      code,
      requestId,
    });
    response.setHeader("Retry-After", "1");
    response.status(503).json({
      statusCode: 503,
      code: "DATABASE_UNAVAILABLE",
      message: "Service temporarily unavailable. Please retry.",
      requestId,
    });
  }
}
