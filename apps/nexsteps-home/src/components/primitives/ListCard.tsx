import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { homeTokens } from "@/design/tokens";

export type ListCardItem = {
  title: string;
  detail?: string;
  meta?: string;
  onPress?: () => void;
};

export function ListCard({ title, items }: { title?: string; items: ListCardItem[] }) {
  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.card}>
        {items.map((item, index) => (
          <Pressable
            key={item.title}
            onPress={item.onPress}
            disabled={!item.onPress}
            accessibilityRole={item.onPress ? "button" : undefined}
            style={({ pressed }) => [
              styles.row,
              index > 0 ? styles.rowDivider : undefined,
              pressed ? styles.rowPressed : undefined,
            ]}
          >
            <View style={styles.marker} />
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.detail ? <Text style={styles.rowDetail}>{item.detail}</Text> : null}
            </View>
            {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
            {item.onPress ? (
              <Ionicons name="chevron-forward" size={16} color={homeTokens.colors.text.subtle} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: homeTokens.spacing.xs,
  },
  title: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: homeTokens.typography.body.md.size,
    lineHeight: homeTokens.typography.body.md.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  card: {
    borderRadius: homeTokens.radius.lg,
    backgroundColor: homeTokens.colors.bg.surface,
    overflow: "hidden",
  },
  row: {
    minHeight: homeTokens.metrics.listRowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: homeTokens.borderWidth.hairline,
    borderTopColor: homeTokens.colors.wireframe.line,
  },
  rowPressed: {
    backgroundColor: homeTokens.colors.bg.panel,
  },
  marker: {
    width: 8,
    height: 8,
    borderRadius: homeTokens.radius.round,
    backgroundColor: homeTokens.colors.accent.primary,
    shadowColor: homeTokens.colors.accent.subtle,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  rowContent: {
    flex: 1,
    gap: homeTokens.spacing.xxxs,
  },
  rowTitle: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  rowDetail: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.muted,
  },
  rowMeta: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.subtle,
  },
});
