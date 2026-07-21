import type { Sector, BuyNowCheckoutPayload } from "./buy-now-client";
import type { ConfiguratorState } from "../app/configure/state";
import type { Vertical } from "@pathway/types";

export type ConfiguratorOrganisation = {
  organisationName: string;
  contactName: string;
  workEmail: string;
  password: string;
  successUrl?: string;
  cancelUrl?: string;
};

export function isValidWorkEmail(workEmail: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail);
}

export function verticalToSector(vertical: Vertical): Sector {
  switch (vertical) {
    case "CHURCH":
      return "CHURCH";
    case "CLUB":
      return "CLUB";
    case "CHARITY":
      return "CHARITY";
    case "INDEPENDENT_SCHOOL":
    case "ACE_SCHOOL":
    case "STATE_SCHOOL":
    case "NURSERY":
      return "SCHOOL";
  }
}

export function buildCheckoutPayload(
  state: ConfiguratorState,
  organisation: ConfiguratorOrganisation,
): BuyNowCheckoutPayload {
  if (!state.vertical || !state.planCode) {
    throw new Error("A vertical and plan are required before checkout.");
  }

  return {
    planCode: state.planCode,
    billingPeriod: state.frequency,
    storageAddon100Gb: state.storageChoice === "100" ? 1 : 0,
    storageAddon200Gb: state.storageChoice === "200" ? 1 : 0,
    storageAddon1Tb: state.storageChoice === "1000" ? 1 : 0,
    selectedModules:
      state.selectedModules.length > 0 ? state.selectedModules : undefined,
    orgName: organisation.organisationName,
    contactName: organisation.contactName,
    contactEmail: organisation.workEmail,
    password: organisation.password,
    sector: verticalToSector(state.vertical),
    successUrl: organisation.successUrl,
    cancelUrl: organisation.cancelUrl,
  };
}
