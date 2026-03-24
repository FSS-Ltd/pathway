export const tokens = {
  colors: {
    bg: {
      shell: "#F5F5F5",
      surface: "#FFFFFF",
      muted: "#F8F9FA",
      auth: "#F5F5F5",
      family: "#F5F5F5",
      serve: "#F5F5F5",
      panel: "#EEF3F8",
    },
    text: {
      primary: "#333333",
      muted: "#666666",
      subtle: "#999999",
      inverse: "#FFFFFF",
      onAccent: "#333333",
    },
    accent: {
      primary: "#76D7C4",
      strong: "#5CC9B4",
      subtle: "#DDF5EF",
      secondary: "#FFD166",
      family: "#FFD166",
      serve: "#4DA9E5",
      serveSoft: "#E3F2FD",
      familySoft: "#FFF7DA",
    },
    border: {
      subtle: "rgba(51, 51, 51, 0.08)",
      strong: "rgba(51, 51, 51, 0.16)",
    },
    status: {
      ok: "#22C55E",
      warn: "#F59E0B",
      danger: "#D4183D",
      info: "#4DA9E5",
    },
  },
  typography: {
    fontFamily: {
      heading: "Nunito_700Bold",
      body: "Quicksand_400Regular",
    },
    heading: {
      xl: { size: 36, lineHeight: 42 },
      lg: { size: 30, lineHeight: 36 },
      md: { size: 24, lineHeight: 30 },
      sm: { size: 20, lineHeight: 26 },
      xs: { size: 18, lineHeight: 24 },
    },
    body: {
      lg: { size: 18, lineHeight: 26 },
      md: { size: 16, lineHeight: 24 },
      sm: { size: 14, lineHeight: 21 },
      xs: { size: 12, lineHeight: 18 },
    },
    weight: {
      regular: "500",
      semibold: "600",
      bold: "700",
      extraBold: "800",
    },
  },
  spacing: {
    xxxs: 2,
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    round: 999,
  },
  layout: {
    screenHorizontalPadding: 20,
    screenTopPadding: 12,
    cardPadding: 16,
    maxReadableWidth: 720,
  },
  shadow: {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    floating: {
      shadowColor: "#000000",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  },
  borderWidth: {
    hairline: 1,
    strong: 2,
  },
} as const;

export type MobileTokens = typeof tokens;
