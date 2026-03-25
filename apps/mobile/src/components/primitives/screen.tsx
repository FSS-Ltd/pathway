import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getSpaceAccentColor,
  getSpaceBackgroundColor,
  mobileTokens,
  type MobileSpaceTone,
} from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import { BrandLogo } from "./brand-logo";

type ScreenProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  tone?: MobileSpaceTone;
  badge?: string;
}>;

export function Screen({
  title,
  subtitle,
  tone = "auth",
  badge,
  children,
}: ScreenProps) {
  const { signOut } = useAppReady();
  const showSpaceActions = tone === "family" || tone === "serve";

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: getSpaceBackgroundColor(tone) }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showSpaceActions ? (
          <View style={styles.spaceActionsRow}>
            <Pressable
              onPress={() => router.push("/(auth)/site-select")}
              style={({ pressed }) => [styles.spaceActionButton, pressed ? styles.pressed : undefined]}
            >
              <Text style={styles.spaceActionText}>Switch Site/Space</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void signOut();
                router.replace("/(auth)/sign-in");
              }}
              style={({ pressed }) => [styles.spaceActionButton, pressed ? styles.pressed : undefined]}
            >
              <Text style={styles.spaceActionText}>Logout</Text>
            </Pressable>
          </View>
        ) : null}

        {(title || subtitle || badge) ? (
          <View
            style={[
              styles.hero,
              {
                borderColor: mobileTokens.colors.border.subtle,
                backgroundColor: mobileTokens.colors.bg.surface,
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <BrandLogo width={126} height={46} />
            </View>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: getSpaceAccentColor(tone) }]}> 
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}

        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function InfoCard({
  title,
  body,
  tone = "auth",
}: {
  title: string;
  body: string;
  tone?: MobileSpaceTone;
}) {
  return (
    <View style={[styles.card, { borderColor: mobileTokens.colors.border.subtle }]}> 
      <View
        style={[
          styles.cardStripe,
          { backgroundColor: getSpaceAccentColor(tone) },
        ]}
      />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: mobileTokens.layout.screenHorizontalPadding,
    paddingTop: mobileTokens.layout.screenTopPadding,
    paddingBottom: mobileTokens.spacing.xxl,
    gap: mobileTokens.spacing.md,
  },
  spaceActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: mobileTokens.spacing.xs,
  },
  spaceActionButton: {
    minHeight: 34,
    borderRadius: mobileTokens.radius.round,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    backgroundColor: mobileTokens.colors.bg.surface,
    paddingHorizontal: mobileTokens.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  spaceActionText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  hero: {
    borderWidth: mobileTokens.borderWidth.hairline,
    borderRadius: mobileTokens.radius.xxl,
    padding: mobileTokens.layout.cardPadding,
    gap: mobileTokens.spacing.xs,
    shadowColor: mobileTokens.shadow.card.shadowColor,
    shadowOpacity: mobileTokens.shadow.card.shadowOpacity,
    shadowOffset: mobileTokens.shadow.card.shadowOffset,
    shadowRadius: mobileTokens.shadow.card.shadowRadius,
    elevation: mobileTokens.shadow.card.elevation,
  },
  logoWrap: {
    marginBottom: mobileTokens.spacing.xs,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xxs,
    borderRadius: mobileTokens.radius.round,
  },
  badgeText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.xs.size,
    lineHeight: mobileTokens.typography.body.xs.lineHeight,
    color: mobileTokens.colors.text.onAccent,
  },
  title: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.md.size,
    lineHeight: mobileTokens.typography.heading.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  subtitle: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  content: {
    gap: mobileTokens.spacing.sm,
  },
  pressed: {
    opacity: 0.84,
  },
  card: {
    borderWidth: mobileTokens.borderWidth.hairline,
    borderRadius: mobileTokens.radius.xl,
    backgroundColor: mobileTokens.colors.bg.surface,
    padding: mobileTokens.layout.cardPadding,
    gap: mobileTokens.spacing.xs,
  },
  cardStripe: {
    height: 4,
    width: 56,
    borderRadius: mobileTokens.radius.round,
    marginBottom: mobileTokens.spacing.xxs,
  },
  cardTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.xs.size,
    lineHeight: mobileTokens.typography.heading.xs.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  cardBody: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
