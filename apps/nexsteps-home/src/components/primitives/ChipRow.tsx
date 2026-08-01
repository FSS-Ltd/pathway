import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { homeTokens } from "@/design/tokens";

export function ChipRow({
  label,
  items,
  active = [],
  onPress,
}: {
  label?: string;
  items: string[];
  active?: boolean[];
  onPress?: (index: number) => void;
}) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {items.map((item, index) => {
          const isActive = active[index] ?? false;
          return (
            <Pressable
              key={item}
              onPress={onPress ? () => onPress(index) : undefined}
              disabled={!onPress}
              accessibilityRole={onPress ? "button" : undefined}
              accessibilityState={onPress ? { selected: isActive } : undefined}
              style={[styles.chip, isActive ? styles.chipActive : undefined]}
            >
              {isActive ? (
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={homeTokens.colors.text.onAccent}
                  style={styles.chipIcon}
                />
              ) : null}
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : undefined]}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: homeTokens.spacing.xs,
  },
  label: {
    // Quicksand's real cuts stop at 700; extraBold (800) has no matching
    // loaded weight, so bold (700) is the closest achievable match.
    fontFamily: homeTokens.typography.bodyFamily.bold,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: 11,
    letterSpacing: homeTokens.typography.wireframe.eyebrow.letterSpacing,
    textTransform: "uppercase",
    color: homeTokens.colors.wireframe.eyebrow,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: homeTokens.spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: homeTokens.metrics.chipMinHeight,
    paddingHorizontal: 11,
    borderRadius: homeTokens.radius.round,
    backgroundColor: homeTokens.colors.bg.panel,
  },
  chipActive: {
    backgroundColor: homeTokens.colors.accent.primary,
  },
  chipIcon: {
    marginRight: homeTokens.spacing.xxxs,
  },
  chipText: {
    fontFamily: homeTokens.typography.bodyFamily.bold,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: 11,
    color: homeTokens.colors.text.primary,
  },
  chipTextActive: {
    color: homeTokens.colors.text.onAccent,
  },
});
