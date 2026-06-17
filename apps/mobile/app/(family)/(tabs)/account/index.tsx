import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, BrandedButton, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";

export default function FamilyAccountScreen() {
  const { bootstrapState, switchSpace, signOut } = useAppReady();
  const isReady = bootstrapState.status === "ready";
  const activeSite = isReady
    ? bootstrapState.activeSiteState.sites.find((site) => site.id === bootstrapState.activeSiteState.activeSiteId)
    : null;

  const hasServeAccess = isReady ? bootstrapState.hasServeAccess : false;
  const isDualSpaceUser = isReady ? bootstrapState.isDualSpaceUser : false;

  return (
    <Screen tone="family" badge="Family Space" title="Family settings" subtitle="Manage privacy, notices, and account preferences.">
      <BrandedCard style={styles.workspaceCard}>
        <SectionTitle title="Workspace" subtitle={activeSite ? activeSite.name : "No active site selected"} />
        <View style={styles.inlineRow}>
          <Chip
            label={activeSite?.orgName ? `Org: ${activeSite.orgName}` : "Organisation unavailable"}
            tone="family"
          />
          <Chip label={isDualSpaceUser ? "Dual space access" : "Family only access"} tone="serve" />
        </View>

        <View style={styles.workspaceActions}>
          <BrandedButton
            label="Switch site"
            tone="family"
            variant="secondary"
            onPress={() => router.push("/(auth)/site-select")}
          />
          {hasServeAccess ? (
            <BrandedButton
              label="Switch to Serve Space"
              tone="serve"
              variant="primary"
              onPress={() => {
                void (async () => {
                  await switchSpace("serve");
                  router.replace("/(serve)/(tabs)/attendance");
                })();
              }}
            />
          ) : (
            <Text style={styles.workspaceHint}>
              Serve Space is unavailable for this site. Switch site to check other access.
            </Text>
          )}
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Profile" />
        <ListRow title="Primary contact" subtitle="jane.parent@email.com" right="Edit" />
        <ListRow title="Emergency contact" subtitle="+44 7123 456 789" right="Edit" />
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Consent and privacy" subtitle="Family-safe controls" />
        <View style={styles.inlineRow}>
          <Chip label="Org photo/video consent: Enabled" tone="family" />
          <Chip label="Data export available" tone="serve" />
        </View>
        <Text style={styles.blockText}>Safeguarding records and internal notes are not shown in Family Space.</Text>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Notifications" />
        <ListRow title="Push notifications" subtitle="Attendance, notices, reminders" right="On" />
        <ListRow title="Email summaries" subtitle="Weekly digest" right="On" />
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Session" subtitle="Secure access controls" />
        <Pressable
          onPress={() => {
            void signOut();
            router.replace("/(auth)/sign-in");
          }}
          style={({ pressed }) => [styles.signOutButton, pressed ? styles.pressed : undefined]}
        >
          <Text style={styles.signOutText}>Log out</Text>
        </Pressable>
      </BrandedCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  workspaceCard: {
    backgroundColor: mobileTokens.colors.accent.familySoft,
  },
  inlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  workspaceActions: {
    gap: mobileTokens.spacing.xs,
  },
  workspaceHint: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.subtle,
  },
  blockText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: mobileTokens.radius.lg,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    backgroundColor: mobileTokens.colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  pressed: {
    opacity: 0.86,
  },
});
