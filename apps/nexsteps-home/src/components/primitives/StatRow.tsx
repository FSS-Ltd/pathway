import { StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export type StatItem = {
  value: string;
  label: string;
};

export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item.label} style={styles.card}>
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: homeTokens.spacing.sm,
  },
  card: {
    flex: 1,
    minHeight: homeTokens.metrics.statCardMinHeight,
    borderRadius: homeTokens.radius.stat,
    backgroundColor: homeTokens.colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: homeTokens.spacing.xxxs,
  },
  value: {
    fontFamily: homeTokens.typography.headingFamily.extraBold,
    fontWeight: homeTokens.typography.weight.extraBold,
    fontSize: 21,
  },
  label: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
});
