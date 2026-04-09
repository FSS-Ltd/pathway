import { Injectable } from "@nestjs/common";
import { getPlanDefinition, type PlanDefinition } from "./billing-plans";
import {
  type PlanPreviewAddons,
  type PlanPreviewCaps,
  type PlanPreviewRequest,
  type PlanPreviewResponse,
} from "./plan-preview.types";

@Injectable()
export class PlanPreviewService {
  // TODO: Keep in sync with Buy Now UI add-on block size (Option A: +25 AV30 blocks for Starter/Growth preview).
  private readonly av30BlockSize = 25;

  preview(input: PlanPreviewRequest): PlanPreviewResponse {
    let trimmedPlanCode = (input.planCode ?? "").trim();
    
    // Normalize CORE_* to MINIMUM_* for Stripe compatibility
    if (trimmedPlanCode === "CORE_MONTHLY") trimmedPlanCode = "MINIMUM_MONTHLY";
    if (trimmedPlanCode === "CORE_YEARLY") trimmedPlanCode = "MINIMUM_YEARLY";
    
    const planDefinition = getPlanDefinition(trimmedPlanCode);
    const addons = input.addons ?? {};
    const addonPolicyResult = this.applyAddonPolicy(planDefinition, addons);

    const base = this.computeBaseCaps(planDefinition);
    const addonResult = this.computeAddonCaps(addonPolicyResult.sanitisedAddons);
    const effectiveCaps = this.combineCaps(base, addonResult.caps);
    const notes = this.buildNotes(
      planDefinition,
      addonPolicyResult.rawAddons,
      addonResult,
      addonPolicyResult.warnings,
    );

    const hasRawAddons = Object.values(addonPolicyResult.rawAddons).some(
      (value) => value !== undefined,
    );

    return {
      planCode: trimmedPlanCode,
      planTier: planDefinition?.tier ?? null,
      displayName: planDefinition?.displayName ?? null,
      billingPeriod: planDefinition?.billingPeriod ?? null,
      selfServe: planDefinition?.selfServe ?? null,
      base,
      addons: {
        ...addonResult.caps,
        ...(hasRawAddons ? { rawAddons: addonPolicyResult.rawAddons } : {}),
        extraAv30Blocks: addonResult.blocks,
      },
      effectiveCaps,
      notes,
    };
  }

  private computeBaseCaps(plan: PlanDefinition | null): PlanPreviewCaps {
    return {
      av30Cap: plan?.av30Included ?? null,
      maxChildren: plan?.maxChildrenIncluded ?? null,
      storageGbCap: plan?.storageGbIncluded ?? null,
      smsMessagesCap: plan?.smsMessagesIncluded ?? null,
      leaderSeatsIncluded: plan?.leaderSeatsIncluded ?? null,
      maxSites: plan?.maxSitesIncluded ?? null,
    };
  }

  private computeAddonCaps(
    addons: PlanPreviewAddons,
  ): { caps: PlanPreviewCaps; blocks: number | null; hadNegative: boolean } {
    const normalise = (value: number | undefined): { value: number; negative: boolean } => {
      if (typeof value !== "number" || Number.isNaN(value)) return { value: 0, negative: false };
      if (value < 0) return { value: 0, negative: true };
      return { value, negative: false };
    };

    const av30Blocks = normalise(addons.extraAv30Blocks);
    const storage = normalise(addons.extraStorageGb);
    const sms = normalise(addons.extraSmsMessages);
    const seats = normalise(addons.extraLeaderSeats);
    const sites = normalise(addons.extraSites);

    const blocks = av30Blocks.value > 0 ? av30Blocks.value : null;
    const caps: PlanPreviewCaps = {
      av30Cap:
        av30Blocks.value > 0 ? av30Blocks.value * this.av30BlockSize : null,
      maxChildren: null,
      storageGbCap: storage.value > 0 ? storage.value : null,
      smsMessagesCap: sms.value > 0 ? sms.value : null,
      leaderSeatsIncluded: seats.value > 0 ? seats.value : null,
      maxSites: sites.value > 0 ? sites.value : null,
    };

    return {
      caps,
      blocks,
      hadNegative:
        av30Blocks.negative ||
        storage.negative ||
        sms.negative ||
        seats.negative ||
        sites.negative,
    };
  }

  private combineCaps(
    base: PlanPreviewCaps,
    addons: PlanPreviewCaps,
  ): PlanPreviewCaps {
    const sum = (a: number | null, b: number | null): number | null => {
      if (a === null && b === null) return null;
      return (a ?? 0) + (b ?? 0);
    };

    return {
      av30Cap: sum(base.av30Cap, addons.av30Cap),
      maxChildren: base.maxChildren,
      storageGbCap: sum(base.storageGbCap, addons.storageGbCap),
      smsMessagesCap: sum(base.smsMessagesCap, addons.smsMessagesCap),
      leaderSeatsIncluded: sum(
        base.leaderSeatsIncluded,
        addons.leaderSeatsIncluded,
      ),
      maxSites: sum(base.maxSites, addons.maxSites),
    };
  }

  private buildNotes(
    plan: PlanDefinition | null,
    addons: PlanPreviewAddons,
    addonResult: { caps: PlanPreviewCaps; blocks: number | null; hadNegative: boolean },
    policyWarnings: string[],
  ): PlanPreviewResponse["notes"] {
    const warnings = ["price_not_included", ...policyWarnings];
    let source: PlanPreviewResponse["notes"]["source"] = "plan_catalogue";

    if (!plan) {
      source = "unknown_plan";
      warnings.push("plan_not_in_catalogue", "using_addons_only");
    }

    if (plan?.maxSitesIncluded === null && (addonResult.caps.maxSites ?? 0) > 0) {
      warnings.push("extra_sites_ignored_for_unlimited_plan");
    }

    if (plan?.av30Included === null && (addonResult.caps.av30Cap ?? 0) > 0) {
      warnings.push("extra_av30_ignored_for_unlimited_plan");
    }

    if (addonResult.hadNegative) {
      warnings.push("negative_addon_values_normalised_to_zero");
    }

    return { source, warnings };
  }

  private applyAddonPolicy(
    plan: PlanDefinition | null,
    addons: PlanPreviewAddons,
  ): {
    rawAddons: PlanPreviewAddons;
    sanitisedAddons: PlanPreviewAddons;
    warnings: string[];
  } {
    const rawAddons = { ...addons };
    const warnings: string[] = [];

    if (plan?.tier === "core") {
      if ((rawAddons.extraAv30Blocks ?? 0) > 0) {
        warnings.push("core_capacity_addon_blocked_av30");
      }
      if ((rawAddons.extraSites ?? 0) > 0) {
        warnings.push("core_capacity_addon_blocked_sites");
      }

      return {
        rawAddons,
        sanitisedAddons: {
          ...rawAddons,
          extraAv30Blocks: 0,
          extraSites: 0,
        },
        warnings,
      };
    }

    return {
      rawAddons,
      sanitisedAddons: rawAddons,
      warnings,
    };
  }
}
