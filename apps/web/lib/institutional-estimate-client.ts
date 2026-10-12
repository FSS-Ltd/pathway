import type {
  InstitutionalPlanCode,
  InstitutionalQuoteResult,
} from "@pathway/pricing";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export async function estimateInstitutionalPrice(
  planCode: InstitutionalPlanCode,
  enrolledChildren: number,
  signal?: AbortSignal,
): Promise<InstitutionalQuoteResult> {
  const response = await fetch(
    `${apiBaseUrl}/billing/institutional/catalogue/estimate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, enrolledChildren }),
      signal,
    },
  );
  if (!response.ok) throw new Error("Institutional estimate unavailable");
  return response.json() as Promise<InstitutionalQuoteResult>;
}
