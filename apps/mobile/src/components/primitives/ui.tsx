import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle, View } from "react-native";

import { getSpaceAccentColor, mobileTokens, type MobileSpaceTone } from "@/design/tokens";

export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function BrandedCard({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  tone = "serve",
  kind = "soft",
}: {
  label: string;
  tone?: MobileSpaceTone;
  kind?: "soft" | "solid";
}) {
  const accent = getSpaceAccentColor(tone);
  return (
    <View
      style={[
        styles.chip,
        kind === "solid" ? { backgroundColor: accent } : { backgroundColor: `${accent}26` },
      ]}
    >
      <Text style={[styles.chipText, kind === "solid" ? styles.chipTextSolid : undefined]}>{label}</Text>
    </View>
  );
}

export function BrandedButton({
  label,
  onPress,
  tone = "serve",
  variant = "primary",
}: {
  label: string;
  onPress?: () => void;
  tone?: MobileSpaceTone;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base =
    variant === "primary"
      ? { backgroundColor: tone === "serve" ? mobileTokens.colors.accent.serve : mobileTokens.colors.accent.primary }
      : variant === "secondary"
        ? { backgroundColor: mobileTokens.colors.accent.family }
        : { backgroundColor: mobileTokens.colors.bg.surface, borderWidth: 1, borderColor: mobileTokens.colors.border.strong };

  const textColor = variant === "ghost" ? mobileTokens.colors.text.primary : mobileTokens.colors.text.onAccent;

  return (
    <Pressable style={[styles.button, base]} onPress={onPress}>
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <Text style={styles.rowRight}>{right}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    gap: mobileTokens.spacing.xxxs,
    marginBottom: mobileTokens.spacing.xs,
  },
  sectionTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.sm.size,
    lineHeight: mobileTokens.typography.heading.sm.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  sectionSubtitle: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  card: {
    borderRadius: mobileTokens.radius.xl,
    backgroundColor: mobileTokens.colors.bg.surface,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    padding: mobileTokens.layout.cardPadding,
    gap: mobileTokens.spacing.sm,
    shadowColor: mobileTokens.shadow.card.shadowColor,
    shadowOpacity: mobileTokens.shadow.card.shadowOpacity,
    shadowOffset: mobileTokens.shadow.card.shadowOffset,
    shadowRadius: mobileTokens.shadow.card.shadowRadius,
    elevation: mobileTokens.shadow.card.elevation,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: mobileTokens.radius.round,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xxs,
  },
  chipText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  chipTextSolid: {
    color: mobileTokens.colors.text.onAccent,
  },
  button: {
    minHeight: 52,
    borderRadius: mobileTokens.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: mobileTokens.spacing.md,
  },
  buttonText: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xs,
  },
  rowContent: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  rowTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  rowSubtitle: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  rowRight: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.subtle,
  },
});
