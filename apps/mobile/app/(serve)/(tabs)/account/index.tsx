import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import { BrandedButton, BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";

export default function ServeAccountScreen() {
  const { bootstrapState, switchSpace, signOut } = useAppReady();
  const isReady = bootstrapState.status === "ready";
  const activeSite = isReady
    ? bootstrapState.activeSiteState.sites.find((site) => site.id === bootstrapState.activeSiteState.activeSiteId)
    : null;

  const hasFamilyAccess = isReady ? bootstrapState.hasFamilyAccess : false;
  const isDualSpaceUser = isReady ? bootstrapState.isDualSpaceUser : false;

  return (
    <Screen
      tone="serve"
      badge="Serve Space"
      title="Serve settings"
      subtitle="Manage your site context, roles, and workspace preferences."
    >
      <BrandedCard style={styles.workspaceCard}>
        <SectionTitle title="Workspace" subtitle={activeSite ? activeSite.name : "No active site selected"} />
        <View style={styles.inlineRow}>
          <Chip
            label={activeSite?.orgName ? `Org: ${activeSite.orgName}` : "Organisation unavailable"}
            tone="serve"
          />
          <Chip label={isDualSpaceUser ? "Dual space access" : "Serve only access"} tone="serve" />
        </View>

        <View style={styles.workspaceActions}>
          <BrandedButton
            label="Switch site"
            tone="serve"
            variant="ghost"
            onPress={() => router.push("/(auth)/site-select")}
          />
          {hasFamilyAccess ? (
            <BrandedButton
              label="Switch to Family Space"
              tone="family"
              variant="secondary"
              onPress={() => {
                void (async () => {
                  await switchSpace("family");
                  router.replace("/(family)/(tabs)/home");
                })();
              }}
            />
          ) : (
            <Text style={styles.workspaceHint}>
              Family Space is unavailable for this site. Switch site to check other access.
            </Text>
          )}
        </View>
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Role context" subtitle="Current operational permissions" />
        <ListRow title="Role scope" subtitle="Site-level operational access" right="Active" />
        <ListRow title="Safeguarding visibility" subtitle="Restricted to authorized roles" right="Enabled" />
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
    backgroundColor: mobileTokens.colors.accent.serveSoft,
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
