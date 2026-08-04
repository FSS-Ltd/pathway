import { apiClient } from "./http";

export type SignupResult = {
  success: true;
  orgId: string;
  tenantId: string;
};

/**
 * Provisions the household for an already Clerk-authenticated, verified
 * principal - the token identifies who's signing up, there's no body left
 * to send (email/password are Clerk's job now).
 */
export function signup(token: string) {
  return apiClient.request<SignupResult>("/public/nexsteps-home/signup", {
    method: "POST",
    token,
  });
}
