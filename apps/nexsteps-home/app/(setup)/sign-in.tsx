import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

export default function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleSignIn = async () => {
    if (!canSubmit || !isLoaded) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const attempt = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // AppProviders reacts to Clerk's isSignedIn flipping true once
        // setActive() resolves - no need to route manually here.
      } else {
        setError(
          "We've upgraded sign-in. Please reset your password to continue - check your email for a reset link, or use account recovery below.",
        );
      }
    } catch (err) {
      setError(
        isClerkAPIResponseError(err)
          ? err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Sign-in failed."
          : err instanceof Error
            ? err.message
            : "Unable to sign in right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Account"
          title="Sign in"
          description="Continue with your family's account."
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
            {
              key: "password",
              label: "Password",
              value: password,
              onChangeText: setPassword,
              placeholder: "Your password",
              secureTextEntry: true,
              autoCapitalize: "none",
            },
          ]}
        />

        {error ? <NoticeCard title="Could not sign in" body={error} tone="danger" /> : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={isSubmitting ? "Signing in..." : "Sign in"}
          onPrimaryPress={canSubmit ? () => void handleSignIn() : undefined}
          secondaryLabel="Forgot your password?"
          onSecondaryPress={() => router.push("/(setup)/account-recover")}
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
