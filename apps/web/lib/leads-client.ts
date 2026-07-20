const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export type CreateDemoLeadPayload = {
  name: string;
  email: string;
  organisation?: string;
  role?: string;
  sector?: string;
  message?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export type CreateToolkitLeadPayload = {
  email: string;
  name?: string;
  orgName?: string;
  organisation?: string;
  role?: string;
  sector?: string;
  consentMarketing: true;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export type CreateTrialLeadPayload = {
  email: string;
  name?: string;
  organisation?: string;
  sector?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export type CreateReadinessLeadPayload = {
  name: string;
  email: string;
  organisation?: string;
  sector?: string;
  answers?: Record<string, string | number | string[]>;
  score?: number;
  band?: string;
  riskAreas?: Array<{ area: string; severity: string; notes?: string }>;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export type CreateTeamTrackerLeadPayload = {
  name: string;
  email: string;
  organisationType:
    | "school"
    | "youth_group_or_church"
    | "club"
    | "charity"
    | "other";
  role:
    | "leader"
    | "administrator"
    | "safeguarding_lead"
    | "volunteer_coordinator"
    | "other";
  teamSize?: "1-10" | "11-25" | "26-50" | "51+";
  currentTools?: "spreadsheet" | "whatsapp" | "paper" | "multiple_tools" | "system";
  consentMarketing: boolean;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
};

export async function createDemoLead(
  payload: CreateDemoLeadPayload,
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE_URL}/leads/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to submit demo request");
  }

  return (await res.json()) as { success: boolean; id: string };
}

export async function createToolkitLead(
  payload: CreateToolkitLeadPayload,
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE_URL}/leads/toolkit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to submit toolkit request");
  }

  return (await res.json()) as { success: boolean; id: string };
}

export async function createTrialLead(
  payload: CreateTrialLeadPayload,
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE_URL}/leads/trial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to join waitlist");
  }

  return (await res.json()) as { success: boolean; id: string };
}

export async function createReadinessLead(
  payload: CreateReadinessLeadPayload,
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE_URL}/leads/readiness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to submit results");
  }

  return (await res.json()) as { success: boolean; id: string };
}

export async function createTeamTrackerLead(
  payload: CreateTeamTrackerLeadPayload,
): Promise<{ success: boolean; downloadUrl: string }> {
  const res = await fetch(`${API_BASE_URL}/leads/team-tracker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to prepare your tracker download");
  }

  return (await res.json()) as { success: boolean; downloadUrl: string };
}

export async function unsubscribeTeamTracker(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/leads/team-tracker/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("We could not process that unsubscribe link.");
  }
}
