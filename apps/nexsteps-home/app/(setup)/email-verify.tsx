import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

/**
 * Adapted from the approved wireframe: the six-digit code entry it shows
 * has no backing implementation. Auth0 (Username-Password-Authentication
 * connection, via react-native-auth0) issues a verification email, not an
 * OTP code, and this SDK version exposes no resend method either - so this
 * screen shows the real, honest state (an email was sent) with no
 * non-functional code field or resend button, and doesn't block continuing:
 * verification isn't gated anywhere downstream yet.
 */
export default function EmailVerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = email ?? "your email address";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Account"
          title="Check your inbox"
          description={`We sent a verification email to ${address}.`}
        />

        <NoticeCard
          title="Check your inbox"
          body="You can continue now - verifying just adds extra account recovery options later."
        />
        <NoticeCard
          title="Why verify?"
          body="It protects family records and lets you recover the account safely."
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Continue"
          onPrimaryPress={() => router.replace("/(setup)/children-list")}
          secondaryLabel="Go back"
          onSecondaryPress={() => router.back()}
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
