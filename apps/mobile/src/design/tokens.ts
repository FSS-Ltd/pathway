import { tokens } from "@pathway/mobile-core";

export const mobileTokens = tokens;

export type MobileSpaceTone = "auth" | "family" | "serve";

export function getSpaceBackgroundColor(space: MobileSpaceTone): string {
  if (space === "family") return mobileTokens.colors.bg.family;
  if (space === "serve") return mobileTokens.colors.bg.serve;
  return mobileTokens.colors.bg.auth;
}

export function getSpaceAccentColor(space: MobileSpaceTone): string {
  if (space === "family") return mobileTokens.colors.accent.family;
  if (space === "serve") return mobileTokens.colors.accent.serve;
  return mobileTokens.colors.accent.primary;
}
