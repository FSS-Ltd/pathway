import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, type TextStyle, type ViewStyle, View } from "react-native";

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
  return (
    <StandardButton
      label={label}
      onPress={onPress}
      tone={tone}
      variant={variant === "ghost" ? "white" : variant}
      size="medium"
    />
  );
}

export function StandardButton({
  label,
  onPress,
  tone = "serve",
  variant = "primary",
  size = "medium",
  disabled = false,
  iconLeft,
  style,
  textStyle,
  multiline = false,
}: {
  label?: string;
  onPress?: () => void;
  tone?: MobileSpaceTone;
  variant?: "primary" | "secondary" | "white" | "disabled";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  iconLeft?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  multiline?: boolean;
}) {
  const accentColor = getSpaceAccentColor(tone);
  const effectiveVariant = disabled ? "disabled" : variant;
  const isDisabled = disabled || effectiveVariant === "disabled";
  const base =
    effectiveVariant === "primary"
      ? { backgroundColor: mobileTokens.colors.accent.primary, borderColor: mobileTokens.colors.accent.primary, borderWidth: 0 }
      : effectiveVariant === "secondary"
        ? { backgroundColor: mobileTokens.colors.accent.secondary, borderColor: mobileTokens.colors.accent.secondary, borderWidth: 0 }
        : effectiveVariant === "white"
          ? { backgroundColor: mobileTokens.colors.bg.surface, borderColor: accentColor, borderWidth: 2 }
          : { backgroundColor: "#F1F2F3", borderColor: "#F1F2F3", borderWidth: 0 };

  const textColor = effectiveVariant === "disabled" ? "#B7B9BB" : mobileTokens.colors.text.primary;
  const heightStyle =
    size === "small"
      ? styles.standardButtonSmall
      : size === "large"
        ? styles.standardButtonLarge
        : styles.standardButtonMedium;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.standardButtonBase,
        heightStyle,
        base,
        style,
        pressed ? styles.buttonPressed : undefined,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {iconLeft ? (
        <View style={[styles.buttonIconWrap, !label ? styles.buttonIconOnly : undefined]}>{iconLeft}</View>
      ) : null}
      {label ? (
        <Text numberOfLines={multiline ? undefined : 1} style={[styles.standardButtonText, multiline ? styles.standardButtonTextMultiline : undefined, { color: textColor }, textStyle]}>
          {label}
        </Text>
      ) : null}
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
  standardButtonBase: {
    borderRadius: mobileTokens.radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: mobileTokens.spacing.md,
  },
  standardButtonSmall: {
    minHeight: 44,
  },
  standardButtonMedium: {
    minHeight: 52,
  },
  standardButtonLarge: {
    minHeight: 60,
  },
  standardButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
  },
  standardButtonTextMultiline: {
    flexShrink: 1,
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonIconWrap: {
    marginRight: mobileTokens.spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonIconOnly: {
    marginRight: 0,
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
