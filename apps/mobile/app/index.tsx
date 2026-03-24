import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";

export default function IndexRoute() {
  const { bootstrapState } = useAppReady();

  if (bootstrapState.status === "loading") {
    return (
      <Screen tone="auth" title="Starting Nexsteps" subtitle="Loading your workspace securely.">
        <ActivityIndicator color={mobileTokens.colors.accent.primary} />
        <Text style={styles.helper}>Checking session, site context, and permissions...</Text>
      </Screen>
    );
  }

  if (bootstrapState.status === "error") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href={bootstrapState.route} />;
}

const styles = StyleSheet.create({
  helper: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.text.muted,
  },
});
