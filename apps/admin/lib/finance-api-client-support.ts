import { apiErrorFromResponse } from "./api-transport";

export async function financeJsonResponse(
  response: Response,
  fallback: string,
): Promise<unknown> {
  if (!response.ok) throw await apiErrorFromResponse(response, fallback);
  return response.json();
}
