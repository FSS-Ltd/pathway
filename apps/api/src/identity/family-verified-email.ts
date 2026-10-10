import { ServiceUnavailableException } from "@nestjs/common";
import type { ClerkManagementService } from "../auth/clerk-management.service";
import type { VerifiedPrincipal } from "../auth/token-verifier";

export async function verifiedFamilyInviteEmail(
  principal: VerifiedPrincipal,
  clerk: ClerkManagementService,
): Promise<string | null> {
  if (principal.provider === "auth0") {
    return principal.emailVerified
      ? (principal.email?.trim().toLowerCase() ?? null)
      : null;
  }
  try {
    return await clerk.getVerifiedPrimaryEmail(principal.sub);
  } catch {
    throw new ServiceUnavailableException(
      "Identity verification is temporarily unavailable",
    );
  }
}
