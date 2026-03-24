import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/primitives/brand-logo";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import { apiClient } from "@/lib/api/client";
import { updateSessionSnapshot } from "@/lib/auth/session-store";

export default function SiteSelectScreen() {
  const { bootstrapState, refreshBootstrap, signOut } = useAppReady();

  const isPreparingSite = bootstrapState.status === "loading";
  const needsSiteSelection = bootstrapState.status === "needs-site-selection";
  const isReady = bootstrapState.status === "ready";

  const hasFamilyAccess = isReady ? bootstrapState.hasFamilyAccess : false;
  const hasServeAccess = isReady ? bootstrapState.hasServeAccess : false;

  useEffect(() => {
    if (bootstrapState.status === "unauthenticated" || bootstrapState.status === "error") {
      router.replace("/(auth)/sign-in");
    }
  }, [bootstrapState]);

  async function handleSelectSite(siteId: string) {
    if (!needsSiteSelection) return;
    const token = bootstrapState.session.accessToken;
    await apiClient.setActiveSite(siteId, token);
    await updateSessionSnapshot({ activeSiteId: siteId });
    await refreshBootstrap();
  }

  async function enterSpace(space: "family" | "serve") {
    if (!isReady) return;
    await updateSessionSnapshot({ preferredSpace: space });
    router.replace(space === "family" ? "/(family)/(tabs)/home" : "/(serve)/(tabs)/attendance");
  }

  function handleFamilyAction() {
    if (!isReady) return;
    if (hasFamilyAccess) {
      void enterSpace("family");
      return;
    }
    router.push("/(auth)/register-child");
  }

  function handleServeAction() {
    if (!isReady || !hasServeAccess) return;
    void enterSpace("serve");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <BrandLogo width={122} height={42} />
          <Pressable
            onPress={() => {
              void signOut();
            }}
            style={({ pressed }) => [styles.headerIconButton, pressed ? styles.pressed : undefined]}
          >
            <Ionicons name="log-out-outline" size={22} color={mobileTokens.colors.text.primary} />
          </Pressable>
        </View>

        <View style={styles.motifDots}>
          <View style={[styles.dot, { backgroundColor: mobileTokens.colors.accent.primary }]} />
          <View style={[styles.dot, { backgroundColor: mobileTokens.colors.accent.secondary }]} />
          <View style={[styles.dot, { backgroundColor: mobileTokens.colors.accent.primary }]} />
          <View style={[styles.dot, { backgroundColor: mobileTokens.colors.accent.secondary }]} />
        </View>

        <Text style={styles.title}>Welcome to Nexsteps</Text>
        <Text style={styles.subtitle}>
          {needsSiteSelection
            ? "Select your site first, then choose your space"
            : "Choose your space to get started"}
        </Text>

        {needsSiteSelection ? (
          <View style={styles.siteSelectionCard}>
            <Text style={styles.siteSelectionTitle}>Select site</Text>
            <View style={styles.siteList}>
              {bootstrapState.activeSiteState.sites.map((site) => (
                <Pressable
                  key={site.id}
                  onPress={() => {
                    void handleSelectSite(site.id);
                  }}
                  style={({ pressed }) => [styles.siteButton, pressed ? styles.pressed : undefined]}
                >
                  <Text style={styles.siteButtonTitle}>{site.name}</Text>
                  <Text style={styles.siteButtonMeta}>{site.orgName ?? "Organisation site"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={mobileTokens.colors.accent.primary} />
              <Text style={styles.loadingText}>Preparing your workspace...</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.spaceCard, !isReady ? styles.disabledCard : undefined]}>
          <View style={styles.spaceTopRow}>
            <View style={styles.iconTile}>
              <Ionicons
                name="people-outline"
                size={34}
                color={hasFamilyAccess ? mobileTokens.colors.text.primary : mobileTokens.colors.text.subtle}
              />
            </View>
            <View style={styles.cardCopyWrap}>
              <Text style={[styles.spaceTitle, !hasFamilyAccess ? styles.disabledText : undefined]}>
                Family Space
              </Text>
              <Text style={[styles.spaceDescription, !hasFamilyAccess ? styles.disabledText : undefined]}>
                Connect with your child&apos;s journey
              </Text>
              {!hasFamilyAccess ? <Text style={styles.hintText}>Add a child to get started</Text> : null}
            </View>
          </View>

          <Pressable
            disabled={isPreparingSite || needsSiteSelection}
            onPress={handleFamilyAction}
            style={({ pressed }) => [
              styles.familyButton,
              !hasFamilyAccess ? styles.familyRegisterButton : undefined,
              pressed ? styles.pressed : undefined,
              isPreparingSite || needsSiteSelection ? styles.disabledButton : undefined,
            ]}
          >
            {!hasFamilyAccess ? (
              <Ionicons name="person-add-outline" size={20} color={mobileTokens.colors.text.primary} />
            ) : null}
            <Text style={styles.familyButtonText}>
              {hasFamilyAccess ? "Enter Family Space" : "Register Child"}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.spaceCard, !hasServeAccess ? styles.disabledCard : undefined]}>
          <View style={styles.spaceTopRow}>
            <View style={styles.iconTile}>
              <Ionicons
                name="heart-outline"
                size={34}
                color={hasServeAccess ? mobileTokens.colors.text.primary : mobileTokens.colors.text.subtle}
              />
            </View>
            <View style={styles.cardCopyWrap}>
              <Text style={[styles.spaceTitle, !hasServeAccess ? styles.disabledText : undefined]}>
                Serve Space
              </Text>
              <Text style={[styles.spaceDescription, !hasServeAccess ? styles.disabledText : undefined]}>
                Make a difference in your community
              </Text>
              {!hasServeAccess ? (
                <Text style={styles.serveHintLink}>Do you want to volunteer?</Text>
              ) : null}
            </View>
          </View>

          {hasServeAccess ? (
            <Pressable
              disabled={!isReady}
              onPress={handleServeAction}
              style={({ pressed }) => [styles.serveButton, pressed ? styles.pressed : undefined]}
            >
              <Text style={styles.serveButtonText}>Enter Serve Space</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.footerText}>
          You can switch between spaces anytime from your profile settings
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 34,
  },
  headerRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  motifDots: {
    marginTop: 16,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    opacity: 0.7,
  },
  title: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 50,
    lineHeight: 56,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 26,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    color: mobileTokens.colors.text.muted,
    textAlign: "center",
  },
  siteSelectionCard: {
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: mobileTokens.colors.bg.surface,
    borderWidth: 1,
    borderColor: "rgba(51, 51, 51, 0.07)",
    padding: 16,
  },
  siteSelectionTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
    marginBottom: 10,
  },
  siteList: {
    gap: 8,
  },
  siteButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 51, 51, 0.08)",
    backgroundColor: mobileTokens.colors.bg.muted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  siteButtonTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  siteButtonMeta: {
    marginTop: 2,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: mobileTokens.colors.text.muted,
  },
  loadingRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: mobileTokens.colors.text.muted,
  },
  spaceCard: {
    borderRadius: 22,
    backgroundColor: mobileTokens.colors.bg.surface,
    borderWidth: 1,
    borderColor: "rgba(51, 51, 51, 0.07)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    padding: 14,
    marginBottom: 14,
  },
  spaceTopRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  iconTile: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: "#E6E6E6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopyWrap: {
    flex: 1,
  },
  spaceTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  spaceDescription: {
    marginTop: 2,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 15,
    lineHeight: 23,
    color: mobileTokens.colors.text.muted,
  },
  hintText: {
    marginTop: 8,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: mobileTokens.colors.text.subtle,
  },
  serveHintLink: {
    marginTop: 8,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    color: mobileTokens.colors.accent.serve,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  familyButton: {
    marginTop: 12,
    marginLeft: 80,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: mobileTokens.colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    alignSelf: "stretch",
  },
  familyRegisterButton: {
    backgroundColor: mobileTokens.colors.accent.secondary,
  },
  familyButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.primary,
  },
  serveButton: {
    marginTop: 12,
    marginLeft: 80,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: mobileTokens.colors.accent.serve,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  serveButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: mobileTokens.typography.weight.bold,
    color: mobileTokens.colors.text.inverse,
  },
  disabledCard: {
    opacity: 0.72,
  },
  disabledText: {
    color: mobileTokens.colors.text.subtle,
  },
  disabledButton: {
    opacity: 0.58,
  },
  footerText: {
    marginTop: 18,
    textAlign: "center",
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 23,
    color: mobileTokens.colors.text.subtle,
  },
  pressed: {
    opacity: 0.86,
  },
});
