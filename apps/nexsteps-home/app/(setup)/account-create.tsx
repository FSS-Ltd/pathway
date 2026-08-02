import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";
import { ApiError, signupApi } from "@/lib/api";

const MIN_PASSWORD_LENGTH = 12;

export default function AccountCreateScreen() {
  const { signInWithPassword } = useAppReady();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = email.trim().length > 0 && password.length >= MIN_PASSWORD_LENGTH;

  const handleCreate = async () => {
    if (!canSave || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const trimmedEmail = email.trim();
    try {
      await signupApi.signup({ email: trimmedEmail, password });
      await signInWithPassword(trimmedEmail, password);
      router.replace({ pathname: "/(setup)/email-verify", params: { email: trimmedEmail } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "An account already exists for this email address."
          : "Could not create your account. Check your details and try again.",
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
          title="Create your parent account"
          description="One secure account for your family organisation."
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
              placeholder: "At least 12 characters",
              helper: "Use at least 12 characters.",
              secureTextEntry: true,
              autoCapitalize: "none",
            },
          ]}
        />

        <NoticeCard
          title="Privacy at a glance"
          body="Family records stay private. Community never exposes child profiles."
        />

        {error ? <NoticeCard title="Could not create account" body={error} tone="danger" /> : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={isSubmitting ? "Creating..." : "Create account"}
          onPrimaryPress={canSave && !isSubmitting ? () => void handleCreate() : undefined}
          secondaryLabel="Sign in or recover account"
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
