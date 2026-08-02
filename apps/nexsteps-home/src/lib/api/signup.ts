import { apiClient } from "./http";

export type SignupInput = {
  email: string;
  password: string;
};

export type SignupResult = {
  success: true;
  orgId: string;
  tenantId: string;
};

export function signup(input: SignupInput) {
  return apiClient.request<SignupResult>("/public/nexsteps-home/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
