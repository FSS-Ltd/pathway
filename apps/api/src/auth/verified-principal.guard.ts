import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { verifyBearerToken, type VerifiedPrincipal } from "./token-verifier";

export interface RequestWithVerifiedPrincipal extends Request {
  verifiedPrincipal?: VerifiedPrincipal;
}

/**
 * Verifies the bearer token and attaches the principal to the request, but
 * never provisions a User or UserIdentity. AuthUserGuard JIT-provisions on
 * any unrecognised token, which races endpoints (e.g. nexsteps-home signup)
 * that provision their own domain records inside a single transaction - use
 * this guard there instead.
 */
@Injectable()
export class VerifiedPrincipalGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<RequestWithVerifiedPrincipal>();
    req.verifiedPrincipal = await verifyBearerToken(
      req.headers.authorization,
    );
    return true;
  }
}

export function getVerifiedPrincipal(req: Request): VerifiedPrincipal {
  const principal = (req as RequestWithVerifiedPrincipal).verifiedPrincipal;
  if (!principal) {
    throw new Error(
      "No verified principal on request - ensure VerifiedPrincipalGuard ran first",
    );
  }
  return principal;
}
