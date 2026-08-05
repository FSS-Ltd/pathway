import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";

const MIN_PASSWORD_LENGTH = 12;

export default function AccountRecoverScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = email.trim().length > 0 && !isSubmitting && isLoaded;
  const canReset = code.trim().length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && !isSubmitting;

  const handleSend = async () => {
    if (!canSend) return;
    setIsSubmitting(true);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
    } catch {
      // Deliberately silent: the confirmation below is shown either way, so
      // the response never reveals whether an account exists for this
      // email (matches the wireframe's own stated privacy intent).
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  };

  const handleReset = async () => {
    if (!canReset || !isLoaded) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password: newPassword,
      });

      if (attempt.status !== "complete") {
        setError("That code didn't work. Check your inbox and try again.");
        return;
      }

      await setActive({ session: attempt.createdSessionId });
      // AppProviders reacts to Clerk's isSignedIn flipping true once
      // setActive() resolves - no need to route manually here.
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Account recovery"
          title="Get back into your account"
          description="We will send a recovery code if the address matches."
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
          <>
            <NoticeCard
              title="Check your inbox"
              body="If that address matches an account, a recovery code is on its way."
              tone="mint"
            />
            <FieldInput
              fields={[
                {
                  key: "code",
                  label: "Recovery code",
                  value: code,
                  onChangeText: setCode,
                  placeholder: "6-digit code",
                  keyboardType: "numeric",
                },
                {
                  key: "newPassword",
                  label: "New password",
                  value: newPassword,
                  onChangeText: setNewPassword,
                  placeholder: "At least 12 characters",
                  helper: "Use at least 12 characters.",
                  secureTextEntry: true,
                  autoCapitalize: "none",
                },
              ]}
            />
          </>
        ) : null}

        {error ? <NoticeCard title="Could not reset password" body={error} tone="danger" /> : null}
      </ScrollView>

      <View style={styles.actions}>
        {sent ? (
          <ScreenActions
            primaryLabel={isSubmitting ? "Resetting..." : "Reset password"}
            onPrimaryPress={canReset ? () => void handleReset() : undefined}
            secondaryLabel="Back to sign in"
            onSecondaryPress={() => router.back()}
          />
        ) : (
          <ScreenActions
            primaryLabel={isSubmitting ? "Sending..." : "Send recovery code"}
            onPrimaryPress={canSend ? () => void handleSend() : undefined}
            secondaryLabel="Back to sign in"
            onSecondaryPress={() => router.back()}
          />
        )}
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
