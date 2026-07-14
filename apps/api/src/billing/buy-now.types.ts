import type { Sector } from "@pathway/types";
import type { PlanCode, PlanTier } from "./billing-plans";

export type BuyNowPlanSelection = {
  planCode: PlanCode | string;
  av30AddonBlocks?: number;
  extraSites?: number;
  extraStorageGb?: number;
  extraSmsMessages?: number;
  extraLeaderSeats?: number;
};

export type BuyNowOrgDetails = {
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string;
  // Required for new-org public checkout (enforced by BuyNowOrgDetailsDto); omitted
  // when this shape is reused as provider metadata for an existing org's purchase.
  sector?: Sector;
  source?: string;
};

export type BuyNowCheckoutRequest = {
  plan: BuyNowPlanSelection;
  org: BuyNowOrgDetails;
  successUrl?: string;
  cancelUrl?: string;
};

export type OrgPurchaseRequest = {
  planCode: string;
  successUrl?: string;
  cancelUrl?: string;
  av30AddonBlocks?: number;
  extraSites?: number;
  extraStorageGb?: number;
  extraSmsMessages?: number;
  extraLeaderSeats?: number;
};

export type BuyNowCheckoutPreview = {
  planCode: string;
  planTier: PlanTier | null;
  billingPeriod: "monthly" | "yearly" | null;
  av30Cap: number | null;
  maxChildren: number | null;
  maxSites: number | null;
  storageGbCap: number | null;
  smsMessagesCap: number | null;
  leaderSeatsIncluded: number | null;
  source: "snapshot" | "plan_catalogue" | "fallback";
};

export type BuyNowCheckoutResponse = {
  preview: BuyNowCheckoutPreview;
  provider: "fake" | "stripe" | "gocardless";
  sessionId: string;
  sessionUrl: string;
  warnings?: string[];
};
