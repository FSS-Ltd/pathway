import { isClerkAPIResponseError, useSignIn } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BrandLogo } from "@/components/primitives/brand-logo";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import { apiClient, ApiError } from "@/lib/api/client";
import { env } from "@/config/env";

export default function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { bootstrapState } = useAppReady();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiDebugMessage, setApiDebugMessage] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrapState.status === "ready" || bootstrapState.status === "needs-site-selection") {
      router.replace("/(auth)/site-select");
    }
  }, [bootstrapState]);

  useEffect(() => {
    if (bootstrapState.status === "error") {
      setErrorMessage(bootstrapState.message);
    }
  }, [bootstrapState]);

  async function handleSignIn() {
    if (isSigningIn || !isLoaded) return;

    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      const attempt = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // Bootstrap re-runs automatically - AppProviders reacts to Clerk's
        // isSignedIn flipping true once setActive() resolves.
      } else {
        // Password migration users land here on their first sign-in
        // attempt (see the "no passwords" migration decision) - Clerk
        // requires a reset before completing sign-in.
        setErrorMessage(
          "We've upgraded sign-in. Please reset your password to continue - check your email for a reset link, or contact your administrator.",
        );
      }
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setErrorMessage(error.errors[0]?.longMessage ?? error.errors[0]?.message ?? "Sign-in failed.");
      } else if (error instanceof ApiError) {
        setErrorMessage("Signed in, but workspace bootstrap failed.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in right now.");
      }
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleApiProbe() {
    if (isTestingApi) return;

    setIsTestingApi(true);
    setApiDebugMessage(null);

    try {
      const health = await apiClient.getHealth();
      setApiDebugMessage(`API reachable: /health status=${health.status}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.message}${error.body ? ` — ${error.body.slice(0, 220)}` : ""}`
          : error instanceof Error
            ? error.message
            : "API probe failed for unknown reason.";
      setApiDebugMessage(message);
    } finally {
      setIsTestingApi(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSigningIn;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <BrandLogo width={184} height={66} />
        </View>

        <View style={styles.headingBlock}>
          <Text
            style={styles.heading}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            Welcome back
          </Text>
          <Text style={styles.subheading}>Log in to continue your journey</Text>
        </View>

        <View style={styles.motifWrap}>
          <Svg width={248} height={42} viewBox="0 0 248 42" fill="none">
            <Path
              d="M18 16C76 4 172 4 230 16"
              stroke="#D8F2EC"
              strokeWidth={4}
              strokeLinecap="round"
            />
            <Path
              d="M36 30C84 22 164 22 212 30"
              stroke="#F7EDD1"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formBlock}>
            <Text style={styles.helperText}>
              Continue with your invited account to access Nexsteps securely.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={mobileTokens.colors.text.subtle}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={mobileTokens.colors.text.subtle}
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleSignIn}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              hitSlop={6}
              onPress={handleSignIn}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit ? styles.primaryDisabled : undefined,
                pressed && canSubmit ? styles.primaryPressed : undefined,
              ]}
            >
              {isSigningIn ? (
                <ActivityIndicator color={mobileTokens.colors.text.primary} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </Pressable>

            {__DEV__ ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Test API connection"
                onPress={handleApiProbe}
                disabled={isTestingApi}
                style={({ pressed }) => [
                  styles.debugButton,
                  isTestingApi ? styles.primaryDisabled : undefined,
                  pressed && !isTestingApi ? styles.primaryPressed : undefined,
                ]}
              >
                {isTestingApi ? (
                  <ActivityIndicator color={mobileTokens.colors.text.primary} />
                ) : (
                  <Text style={styles.debugButtonText}>Test API connection</Text>
                )}
              </Pressable>
            ) : null}

            {apiDebugMessage ? <Text style={styles.debugText}>{apiDebugMessage}</Text> : null}
            {__DEV__ ? <Text style={styles.debugText}>apiUrl: {env.apiUrl}</Text> : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>
        </View>

        <Text style={styles.inviteOnlyText}>
          Access is invite-only. Your organisation will send your sign-up link by email.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTokens.colors.bg.auth,
  },
  container: {
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 44,
  },
  logoWrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 26,
  },
  headingBlock: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  heading: {
    fontFamily: "Nunito_700Bold",
    fontSize: 52,
    lineHeight: 58,
    color: mobileTokens.colors.text.primary,
    letterSpacing: -0.8,
    textAlign: "center",
    width: "100%",
  },
  subheading: {
    fontFamily: "Quicksand_400Regular",
    fontSize: 17,
    lineHeight: 26,
    color: mobileTokens.colors.text.muted,
  },
  motifWrap: {
    alignItems: "center",
    marginBottom: 26,
  },
  formCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(51, 51, 51, 0.08)",
    backgroundColor: mobileTokens.colors.bg.surface,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  formBlock: {
    gap: 14,
  },
  helperText: {
    textAlign: "center",
    fontFamily: "Quicksand_400Regular",
    fontSize: 16,
    lineHeight: 25,
    color: mobileTokens.colors.text.muted,
    paddingHorizontal: 6,
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    backgroundColor: mobileTokens.colors.bg.surface,
    paddingHorizontal: 16,
    fontFamily: "Quicksand_500Medium",
    fontSize: 16,
    color: mobileTokens.colors.text.primary,
  },
  primaryButton: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: mobileTokens.colors.accent.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    marginTop: 2,
  },
  primaryPressed: {
    opacity: 0.92,
  },
  primaryDisabled: {
    opacity: 0.86,
  },
  primaryButtonText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 24,
    lineHeight: 30,
    color: mobileTokens.colors.text.primary,
  },
  debugButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    backgroundColor: mobileTokens.colors.bg.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  debugButtonText: {
    fontFamily: "Quicksand_600SemiBold",
    fontSize: 16,
    lineHeight: 22,
    color: mobileTokens.colors.text.primary,
  },
  debugText: {
    textAlign: "center",
    fontFamily: "Quicksand_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: mobileTokens.colors.text.subtle,
  },
  inviteOnlyText: {
    marginTop: 24,
    textAlign: "center",
    fontFamily: "Quicksand_500Medium",
    fontSize: 15,
    lineHeight: 23,
    color: mobileTokens.colors.text.subtle,
    paddingHorizontal: 6,
  },
  error: {
    marginTop: 4,
    textAlign: "center",
    fontFamily: "Quicksand_500Medium",
    fontSize: 13,
    lineHeight: 19,
    color: mobileTokens.colors.status.danger,
  },
});
