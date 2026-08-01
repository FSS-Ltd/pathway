import { StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export function ScreenHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: homeTokens.spacing.xxs,
  },
  eyebrow: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontWeight: homeTokens.typography.wireframe.eyebrow.weight,
    fontSize: homeTokens.typography.wireframe.eyebrow.size,
    letterSpacing: homeTokens.typography.wireframe.eyebrow.letterSpacing,
    textTransform: homeTokens.typography.wireframe.eyebrow.textTransform,
    color: homeTokens.colors.wireframe.eyebrow,
  },
  title: {
    fontFamily: homeTokens.typography.fontFamily.heading,
    fontWeight: homeTokens.typography.wireframe.screenTitle.weight,
    fontSize: homeTokens.typography.wireframe.screenTitle.size,
    lineHeight: homeTokens.typography.wireframe.screenTitle.lineHeight,
    letterSpacing: homeTokens.typography.wireframe.screenTitle.letterSpacing,
    maxWidth: 330,
    color: homeTokens.colors.text.primary,
  },
  description: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.wireframe.description.size,
    lineHeight: homeTokens.typography.wireframe.description.lineHeight,
    maxWidth: 340,
    color: homeTokens.colors.text.muted,
  },
});
