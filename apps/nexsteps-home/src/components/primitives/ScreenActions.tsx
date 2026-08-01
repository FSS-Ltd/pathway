import { Pressable, StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

/**
 * One dominant primary action per screen (design-system.md: "Keep one
 * dominant primary action"). The optional secondary is always visually
 * subordinate — never a second equally-weighted button.
 */
export function ScreenActions({
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
}: {
  primaryLabel: string;
  onPrimaryPress?: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPrimaryPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, pressed ? styles.pressed : undefined]}
      >
        <Text style={styles.primaryLabel}>{primaryLabel}</Text>
      </Pressable>
      {secondaryLabel ? (
        <Pressable
          onPress={onSecondaryPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : undefined]}
        >
          <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: homeTokens.spacing.sm,
  },
  primary: {
    minHeight: homeTokens.metrics.buttonMinHeight,
    borderRadius: homeTokens.radius.control,
    backgroundColor: homeTokens.colors.accent.primary,
    borderWidth: homeTokens.borderWidth.hairline,
    borderColor: homeTokens.colors.accent.strong,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: homeTokens.colors.accent.strong,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  secondary: {
    minHeight: homeTokens.metrics.buttonMinHeight,
    borderRadius: homeTokens.radius.control,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  primaryLabel: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.weight.extraBold,
    fontSize: homeTokens.typography.body.sm.size,
    color: homeTokens.colors.text.primary,
  },
  secondaryLabel: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.weight.extraBold,
    fontSize: homeTokens.typography.body.sm.size,
    color: homeTokens.colors.text.muted,
  },
});
