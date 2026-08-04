import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthContext } from "../types/auth-context";
import type { RequestWithAuthContext } from "../types/request-with-context";
import { PATHWAY_CONTEXT_PROPERTY } from "../constants";

export function resolveAuthContext(ctx: ExecutionContext): AuthContext {
  const request = ctx
    .switchToHttp()
    .getRequest<RequestWithAuthContext | undefined>();

  if (!request || !request[PATHWAY_CONTEXT_PROPERTY]) {
    throw new UnauthorizedException(
      "Pathway auth context missing. Ensure AuthUserGuard runs before decorators.",
    );
  }

  return request[PATHWAY_CONTEXT_PROPERTY]!;
}

