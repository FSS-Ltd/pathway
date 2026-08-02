import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Deliberately simpler than the wireframe: it mocks a week strip and an
 * upcoming-activity card with fixed demo data. This series has avoided
 * hardcoded/mocked screen content throughout (see Plan 06), and the real
 * week/activity the user just created is one tap away on the Week tab -
 * duplicating it here with fabricated data would be worse than a plain
 * confirmation.
 */
export default function SetupCompleteScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Setup complete"
          title="Your family week is ready"
          description="From now on, NexSteps Home opens here."
        />

        <NoticeCard
          title="You are set up"
          body="There is no tutorial or checklist in the way - just the family week."
          tone="yellow"
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Open Family Week"
          onPrimaryPress={() => router.replace("/(home)/(tabs)/week")}
        />
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
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingTop: homeTokens.metrics.screenContentTop,
    paddingBottom: homeTokens.metrics.tabBarAwareBottomPadding,
    gap: homeTokens.metrics.blockGap,
  },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingBottom: homeTokens.metrics.blockGap,
  },
});
