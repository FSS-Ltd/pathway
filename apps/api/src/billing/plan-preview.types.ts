import type { PlanTier } from "./billing-plans";

export type PlanPreviewAddons = {
  extraAv30Blocks?: number;
  extraStorageGb?: number;
  extraSmsMessages?: number;
  extraLeaderSeats?: number;
  extraSites?: number;
};

export type PlanPreviewRequest = {
  planCode: string;
  addons?: PlanPreviewAddons;
};

export type PlanPreviewCaps = {
  av30Cap: number | null;
  maxChildren: number | null;
  storageGbCap: number | null;
  smsMessagesCap: number | null;
  leaderSeatsIncluded: number | null;
  maxSites: number | null;
};

export type PlanPreviewResponse = {
  planCode: string;
  planTier: PlanTier | null;
  displayName: string | null;
  billingPeriod: "monthly" | "yearly" | "none" | null;
  selfServe: boolean | null;
  base: PlanPreviewCaps;
  addons: PlanPreviewCaps & {
    rawAddons?: PlanPreviewAddons;
    extraAv30Blocks?: number | null;
  };
  effectiveCaps: PlanPreviewCaps;
  notes: {
    source: "plan_catalogue" | "unknown_plan";
    warnings: string[];
  };
};
