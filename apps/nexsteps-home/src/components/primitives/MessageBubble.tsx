import { StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export function MessageBubble({
  sender,
  body,
  time,
  own = false,
}: {
  sender: string;
  body: string;
  time: string;
  own?: boolean;
}) {
  return (
    <View
      style={[styles.container, own ? styles.containerOwn : undefined]}
      accessibilityRole="text"
      accessibilityLabel={`${sender}, ${time}: ${body}`}
    >
      <View
        style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}
      >
        {!own ? <Text style={styles.sender}>{sender}</Text> : null}
        <Text style={[styles.body, own ? styles.bodyOwn : undefined]}>{body}</Text>
      </View>
      <Text style={styles.time}>{time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: "76%",
    gap: homeTokens.spacing.xxxs,
  },
  containerOwn: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  bubbleOther: {
    backgroundColor: homeTokens.colors.bg.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 5,
  },
  bubbleOwn: {
    backgroundColor: homeTokens.colors.accent.primary,
    borderRadius: 16,
    borderBottomRightRadius: 5,
  },
  sender: {
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.xs.size,
    color: homeTokens.colors.wireframe.messageAvatar,
    marginBottom: homeTokens.spacing.xxxs,
  },
  body: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.sm.size,
    lineHeight: homeTokens.typography.body.sm.lineHeight,
    color: homeTokens.colors.text.primary,
  },
  bodyOwn: {
    color: homeTokens.colors.text.onAccent,
  },
  time: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    color: homeTokens.colors.text.subtle,
  },
});
