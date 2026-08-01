import { homeTokens } from "@/design/tokens";

export type Tone = "mint" | "yellow" | "blue" | "neutral" | "danger";

export function toneBorderColor(tone: Tone): string {
  switch (tone) {
    case "mint":
      return "rgba(92,201,180,0.42)";
    case "yellow":
      return "rgba(255,209,102,0.58)";
    case "blue":
      return "rgba(77,169,229,0.35)";
    case "danger":
      return "rgba(212,24,61,0.24)";
    case "neutral":
    default:
      return homeTokens.colors.border.subtle;
  }
}

export function toneAccentColor(tone: Tone): string {
  switch (tone) {
    case "mint":
      return homeTokens.colors.accent.strong;
    case "yellow":
      return homeTokens.colors.wireframe.yellowIcon;
    case "blue":
      return homeTokens.colors.accent.serve;
    case "danger":
      return homeTokens.colors.status.danger;
    case "neutral":
    default:
      return homeTokens.colors.text.muted;
  }
}
