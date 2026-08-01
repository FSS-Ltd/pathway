import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { homeTokens } from "@/design/tokens";
import { toneAccentColor, toneBorderColor, type Tone } from "./tone";

const TONE_ICON: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  mint: "checkmark-circle-outline",
  yellow: "alert-circle-outline",
  blue: "information-circle-outline",
  neutral: "ellipse-outline",
  danger: "warning-outline",
};

function toneBackground(tone: Tone): string {
  switch (tone) {
    case "mint":
      return homeTokens.colors.accent.subtle;
    case "yellow":
      return homeTokens.colors.accent.familySoft;
    case "blue":
      return homeTokens.colors.accent.serveSoft;
    case "danger":
      return homeTokens.colors.wireframe.dangerSoft;
    case "neutral":
    default:
      return homeTokens.colors.bg.panel;
  }
}

export function NoticeCard({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: Tone;
}) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: toneBackground(tone), borderColor: toneBorderColor(tone) },
      ]}
      accessibilityRole="text"
    >
      <View style={styles.iconColumn}>
        <Ionicons name={TONE_ICON[tone]} size={20} color={toneAccentColor(tone)} />
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: homeTokens.spacing.sm,
    padding: 15,
    borderRadius: homeTokens.radius.lg,
    borderWidth: homeTokens.borderWidth.hairline,
  },
  iconColumn: {
    width: 28,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  textColumn: {
    flex: 1,
    gap: homeTokens.spacing.xxxs,
  },
  title: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  body: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
});
