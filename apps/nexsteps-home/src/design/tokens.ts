import { tokens as mobileTokens } from "@pathway/mobile-core/tokens";

/**
 * Extends, never mutates, the shared mobile token source. Every addition
 * here is a wireframe-exact value the shared scale does not cover — see
 * token-conflicts.md for the source and derivation of each one.
 */
export const homeTokens = {
  ...mobileTokens,
  colors: {
    ...mobileTokens.colors,
    wireframe: {
      line: "#DDE3E8",
      dangerSoft: "#FFF0F2",
      blueSoft: "#E8F4FC",
      eyebrow: "#3D8C7D",
      inlineAction: "#318978",
      reviewCount: "#377F72",
      yellowIcon: "#A96D00",
      messageAvatar: "#9A720A",
      flowGroupHeading: "#8A6200",
    },
  },
  radius: {
    ...mobileTokens.radius,
    field: 13,
    control: 14,
    stat: 15,
  },
  typography: {
    ...mobileTokens.typography,
    wireframe: {
      screenTitle: { size: 29, lineHeight: 30, weight: "900", letterSpacing: -1 },
      flowIndexTitle: { size: 30, lineHeight: 31, weight: "900", letterSpacing: -1 },
      description: { size: 13, lineHeight: 20 },
      eyebrow: {
        size: 11,
        weight: "800",
        letterSpacing: 0.88,
        textTransform: "uppercase" as const,
      },
    },
  },
  metrics: {
    screenContentTop: 58,
    screenBottomPadding: 28,
    tabBarAwareBottomPadding: 116,
    blockGap: 12,
    listRowMinHeight: 58,
    fieldGroupMinHeight: 66,
    chipMinHeight: 34,
    buttonMinHeight: 50,
    statCardMinHeight: 82,
    weekDayMinHeight: 78,
    tabBarBaseHeight: 78,
  },
} as const;

export type HomeTokens = typeof homeTokens;
