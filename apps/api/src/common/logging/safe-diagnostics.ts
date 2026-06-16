import { HttpException } from "@nestjs/common";

export type SafeErrorDiagnostic = {
  errorName?: string;
  errorMessage: string;
  statusCode?: number;
  statusClass: string;
};

export function safeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  const statusCode =
    error instanceof HttpException ? error.getStatus() : undefined;
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  return {
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage,
    ...(statusCode ? { statusCode } : {}),
    statusClass: statusCode ? `${Math.floor(statusCode / 100)}xx` : "unknown",
  };
}

export function safeErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
