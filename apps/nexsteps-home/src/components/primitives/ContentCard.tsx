import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { homeTokens } from "@/design/tokens";
import { toneAccentColor, type Tone } from "./tone";

export function ContentCard({
  title,
  body,
  meta,
  action,
  tone = "neutral",
  onPress,
}: {
  title: string;
  body?: string;
  meta?: string;
  action?: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  const content = (
    <>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <View style={styles.actionRow}>
          <Text style={[styles.actionLabel, { color: toneAccentColor(tone) }]}>{action}</Text>
          <Ionicons name="chevron-forward" size={16} color={toneAccentColor(tone)} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[title, action].filter(Boolean).join(", ")}
        style={({ pressed }) => [styles.container, pressed ? styles.pressed : undefined]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    padding: homeTokens.layout.cardPadding,
    borderRadius: homeTokens.radius.lg,
    backgroundColor: homeTokens.colors.bg.surface,
    gap: homeTokens.spacing.xxxs,
    shadowColor: homeTokens.shadow.card.shadowColor,
    shadowOpacity: homeTokens.shadow.card.shadowOpacity,
    shadowOffset: homeTokens.shadow.card.shadowOffset,
    shadowRadius: homeTokens.shadow.card.shadowRadius,
    elevation: homeTokens.shadow.card.elevation,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.85,
  },
  meta: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.subtle,
  },
  title: {
    fontFamily: homeTokens.typography.headingFamily.bold,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: homeTokens.typography.body.md.size,
    lineHeight: homeTokens.typography.body.md.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  body: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.muted,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: homeTokens.spacing.xxxs,
    marginTop: homeTokens.spacing.xxxs,
  },
  actionLabel: {
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
  },
});
