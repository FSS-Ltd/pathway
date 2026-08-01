import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";

/**
 * Placeholder for the approved "welcome" screen (screen-inventory.json id
 * "welcome"). This scaffolding plan builds zero product screens - the real
 * implementation, matched pixel-for-pixel against the wireframe, lands in
 * Plan 05 (setup flow). This exists only so the unauthenticated bootstrap
 * route resolves to something real and sign-in is exercisable end to end.
 */
export default function WelcomeScreen() {
  const { signIn } = useAppReady();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ScreenHeader
          eyebrow="Welcome"
          title="Bring structure to home learning"
          description="A calm week plan, trusted records and a community of families - all in one place."
        />
        <ScreenActions primaryLabel="Sign in" onPrimaryPress={() => void signIn()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: homeTokens.colors.bg.shell,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingBottom: homeTokens.metrics.screenBottomPadding,
    gap: homeTokens.metrics.blockGap,
  },
});
