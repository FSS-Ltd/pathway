import { isClerkAPIResponseError, useAuth, useSignUp } from "@clerk/clerk-expo";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { signupApi } from "@/lib/api";

/**
 * The signup call to provision the household happens here, right after
 * setActive() resolves, in the same async function - not left to
 * AppProviders' bootstrap effect, which also fires the instant Clerk's
 * isSignedIn flips true and would otherwise race this screen's own call
 * to /public/nexsteps-home/signup.
 */
export default function EmailVerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = email ?? "your email address";
  const { isLoaded, signUp, setActive } = useSignUp();
  const { getToken } = useAuth();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const canSubmit = code.trim().length > 0 && !isSubmitting && isLoaded;

  const handleVerify = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });

      if (attempt.status !== "complete") {
        setError("That code didn't work. Check your inbox and try again.");
        return;
      }

      await setActive({ session: attempt.createdSessionId });
      const token = await getToken();
      if (!token) {
        setError("Verified, but we couldn't start your session. Please try signing in.");
        return;
      }

      await signupApi.signup(token);
      router.replace("/(setup)/children-list");
    } catch (err) {
      setError(
        isClerkAPIResponseError(err)
          ? err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "That code didn't work."
          : "That code didn't work. Check your inbox and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isResending || !isLoaded) return;
    setIsResending(true);
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResent(true);
    } catch {
      setError("Could not resend the code right now. Please try again shortly.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Account"
          title="Check your inbox"
          description={`We sent a verification code to ${address}.`}
        />

        <FieldInput
          fields={[
            {
              key: "code",
              label: "Verification code",
              value: code,
              onChangeText: setCode,
              placeholder: "6-digit code",
              keyboardType: "numeric",
            },
          ]}
        />

        <NoticeCard
          title="Why verify?"
          body="It protects family records and confirms you own this email address."
        />

        {resent ? (
          <NoticeCard title="Code resent" body="Check your inbox for a new code." tone="mint" />
        ) : null}
        {error ? <NoticeCard title="Could not verify" body={error} tone="danger" /> : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={isSubmitting ? "Verifying..." : "Verify"}
          onPrimaryPress={canSubmit ? () => void handleVerify() : undefined}
          secondaryLabel={isResending ? "Resending..." : "Resend code"}
          onSecondaryPress={isResending ? undefined : () => void handleResend()}
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
