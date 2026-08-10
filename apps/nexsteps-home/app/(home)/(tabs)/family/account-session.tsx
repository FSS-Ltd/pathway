import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isClerkAPIResponseError, useSession, useUser } from "@clerk/clerk-expo";

import {
  ContentCard,
  FieldInput,
  ListCard,
  NoticeCard,
  ScreenActions,
  ScreenHeader,
  type ListCardItem,
} from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks";
import { useAccountSessions, useChangePassword, useRevokeOtherSessions, type ClerkSession } from "@/lib/queries/account-session";

const MIN_PASSWORD_LENGTH = 12;

function formatSessionLabel(session: ClerkSession): string {
  const activity = session.latestActivity;
  const device = activity.browserName ?? (activity.isMobile ? "Mobile device" : "Desktop device");
  const location = [activity.city, activity.country].filter(Boolean).join(", ");
  return location ? `${device} · ${location}` : device;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AccountSessionScreen() {
  const { isLoaded: userLoaded, user } = useUser();
  const { session } = useSession();
  const { signOut } = useAppReady();

  const sessionsQuery = useAccountSessions(user);
  const revokeOthers = useRevokeOtherSessions();
  const changePassword = useChangePassword();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const currentSessionId = session?.id;

  const handleRevokeOthers = () => {
    if (!sessionsQuery.data || !currentSessionId) return;
    const others = sessionsQuery.data.sessions.filter((s) => s.id !== currentSessionId);
    Alert.alert(
      "Sign out other sessions?",
      `This immediately signs out ${others.length} other device${others.length === 1 ? "" : "s"}. They'll need to sign in again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => revokeOthers.mutate({ sessions: sessionsQuery.data.sessions, currentSessionId }),
        },
      ],
    );
  };

  const canChangePassword =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword;

  const handleChangePassword = () => {
    if (!canChangePassword || !user) return;
    setPasswordError(null);
    setPasswordSuccess(false);
    changePassword.mutate(
      { user, currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setPasswordSuccess(true);
        },
        onError: (err) => {
          setPasswordError(
            isClerkAPIResponseError(err)
              ? err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Could not change your password."
              : "Could not change your password. Check your details and try again.",
          );
        },
      },
    );
  };

  // No "permission denied" state here in the usual 401/403-from-apiClient
  // sense used elsewhere in this plan: there's no tenant/org boundary on
  // this screen, every action operates on the caller's own Clerk user,
  // enforced by Clerk itself. An expired/invalid Clerk session is instead
  // handled by AppBootstrapContext redirecting to /(setup)/welcome before
  // this screen would even render.
  if (userLoaded && user && sessionsQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Account" title="Could not load sessions" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (!userLoaded || !user || sessionsQuery.isLoading || !sessionsQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Account" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const sessions = sessionsQuery.data.sessions;
  const otherSessionCount = sessions.filter((s) => s.id !== currentSessionId).length;

  // A fresh list containing only the current session is the normal/
  // expected state, not an empty state (sub-plan 08f) - only the "other
  // sessions" count below can legitimately be zero.
  const sessionItems: ListCardItem[] = sessions.map((s) => ({
    title: s.id === currentSessionId ? "This device" : formatSessionLabel(s),
    detail: `Active ${formatDate(s.lastActiveAt)}`,
    meta: s.id === currentSessionId ? "Current" : undefined,
  }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · Account"
          title="Account & sessions"
          description="Manage where you're signed in and how you sign in."
        />

        <ListCard title="Signed-in devices" items={sessionItems} />

        {revokeOthers.isError ? (
          <NoticeCard
            title="Could not sign out other sessions"
            body="Check your connection and try again."
            tone="danger"
          />
        ) : revokeOthers.isSuccess ? (
          <NoticeCard title="Other sessions signed out" body="Only this device remains signed in." tone="mint" />
        ) : null}

        <ContentCard
          title="Sign out other sessions"
          body={
            otherSessionCount > 0
              ? `Sign out ${otherSessionCount} other device${otherSessionCount === 1 ? "" : "s"} immediately.`
              : "No other devices are signed in."
          }
          action={otherSessionCount > 0 ? (revokeOthers.isPending ? "Signing out..." : "Sign out") : undefined}
          tone="danger"
          onPress={otherSessionCount > 0 && !revokeOthers.isPending ? handleRevokeOthers : undefined}
        />

        <ContentCard
          title="Sign out this device"
          body="You'll need to sign in again to use NexSteps Home here."
          action="Sign out"
          onPress={() => void signOut()}
        />

        <FieldInput
          fields={[
            {
              key: "currentPassword",
              label: "Current password",
              value: currentPassword,
              onChangeText: setCurrentPassword,
              secureTextEntry: true,
              autoCapitalize: "none",
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
            {
              key: "confirmPassword",
              label: "Confirm new password",
              value: confirmPassword,
              onChangeText: setConfirmPassword,
              secureTextEntry: true,
              autoCapitalize: "none",
            },
          ]}
        />

        {passwordError ? (
          <NoticeCard title="Could not change your password" body={passwordError} tone="danger" />
        ) : passwordSuccess ? (
          <NoticeCard title="Password updated" body="Your password has been changed." tone="mint" />
        ) : null}

        <ScreenActions
          primaryLabel={changePassword.isPending ? "Updating..." : "Change password"}
          onPrimaryPress={canChangePassword && !changePassword.isPending ? handleChangePassword : undefined}
        />

        {/*
          Prerequisite check (sub-plan 08f): whether TOTP is enabled as a
          factor is a Clerk Dashboard setting, not visible from this repo,
          and wasn't confirmed enabled. Shipping session management and
          password change now; showing real (not hardcoded) 2FA status
          without interactive enroll/disable UI, per the brief's guidance
          not to build interactive UI for a capability that might be off.
        */}
        <NoticeCard
          title="Two-factor authentication"
          body={
            sessionsQuery.data.twoFactor.twoFactorEnabled
              ? "Two-factor authentication is on for this account."
              : "Two-factor authentication isn't turned on for this account yet. Authenticator-app setup is coming soon to this screen."
          }
        />
      </ScrollView>
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
});
