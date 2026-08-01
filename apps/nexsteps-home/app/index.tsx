import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";

export default function IndexRoute() {
  const { bootstrapState } = useAppReady();

  if (bootstrapState.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={homeTokens.colors.accent.primary} />
        <Text style={styles.helper}>Checking your session...</Text>
      </View>
    );
  }

  if (bootstrapState.status === "error") {
    return <Redirect href="/(setup)/welcome" />;
  }

  return <Redirect href={bootstrapState.route} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: homeTokens.spacing.sm,
    backgroundColor: homeTokens.colors.bg.shell,
  },
  helper: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.sm.size,
    color: homeTokens.colors.text.muted,
  },
});
