import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";

export default function WelcomeScreen() {
  const { signIn } = useAppReady();

  const handleSignIn = async () => {
    const state = await signIn();
    if (state.status === "ready") {
      router.replace(state.route);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Welcome"
          title="Bring structure to home learning"
          description="A calm week plan, trusted records and a community of families - all in one place."
        />

        <NoticeCard
          title="Know what to do next"
          body="Start with three small setup steps. Your family week is ready straight afterwards."
        />
        <ContentCard
          title="Your week, organised"
          body="Learning, tasks and appointments are visible without turning home into school."
          meta="1 place"
        />
        <ContentCard
          title="Your people, nearby"
          body="Community is optional, adult-only and designed around mutual introductions."
          meta="Private"
          tone="yellow"
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Set up my family"
          onPrimaryPress={() => router.push("/(setup)/account-create")}
          secondaryLabel="I already have an account"
          onSecondaryPress={() => void handleSignIn()}
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
