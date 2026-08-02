import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { resetPasswordWithAuth0 } from "@/lib/auth/auth0-client";

export default function AccountRecoverScreen() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = email.trim().length > 0 && !isSubmitting;

  const handleSend = async () => {
    if (!canSend) return;
    setIsSubmitting(true);
    try {
      await resetPasswordWithAuth0(email.trim());
    } catch {
      // Deliberately silent: the confirmation below is shown either way, so
      // the response never reveals whether an account exists for this
      // email (matches the wireframe's own stated privacy intent).
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Account recovery"
          title="Get back into your account"
          description="We will send a secure recovery link if the address matches."
        />

        <FieldInput
          fields={[
            {
              key: "email",
              label: "Email address",
              value: email,
              onChangeText: setEmail,
              placeholder: "parent@example.com",
              keyboardType: "email-address",
              autoCapitalize: "none",
            },
          ]}
        />

        <NoticeCard
          title="Private response"
          body="For security, the confirmation looks the same whether or not an account exists."
        />

        {sent ? (
          <NoticeCard
            title="Check your inbox"
            body="If that address matches an account, a recovery link is on its way."
            tone="mint"
          />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={isSubmitting ? "Sending..." : "Send recovery link"}
          onPrimaryPress={canSend ? () => void handleSend() : undefined}
          secondaryLabel="Back to sign in"
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
