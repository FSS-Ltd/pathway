import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { homeTokens } from "@/design/tokens";

/**
 * Single source of truth for the 5-tab shell. Both the Tabs.Screen list in
 * (home)/(tabs)/_layout.tsx and this tab bar read from HOME_TABS, unlike
 * apps/mobile's family-bottom-nav.tsx, which duplicates its tab list in a
 * separate FAMILY_ITEMS const that has to be kept in sync by hand.
 *
 * Permanent order, approved in design-system.md: Week, Today, Community,
 * Progress, Family.
 */
export const HOME_TABS = [
  { routeName: "week", label: "Week", iconOutline: "calendar-outline", iconFilled: "calendar" },
  { routeName: "today", label: "Today", iconOutline: "sunny-outline", iconFilled: "sunny" },
  {
    routeName: "community",
    label: "Community",
    iconOutline: "chatbubbles-outline",
    iconFilled: "chatbubbles",
  },
  {
    routeName: "progress",
    label: "Progress",
    iconOutline: "bar-chart-outline",
    iconFilled: "bar-chart",
  },
  { routeName: "family", label: "Family", iconOutline: "people-outline", iconFilled: "people" },
] as const satisfies ReadonlyArray<{
  routeName: string;
  label: string;
  iconOutline: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
}>;

type ExpoTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

export function HomeTabBar({ state, navigation }: ExpoTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { height: homeTokens.metrics.tabBarBaseHeight + Math.max(insets.bottom, 10) },
      ]}
    >
      {HOME_TABS.map((tab) => {
        const route = state.routes.find(
          (r) => r.name === tab.routeName || r.name.startsWith(`${tab.routeName}/`),
        );
        if (!route) return null;
        const isFocused = state.routes[state.index]?.key === route.key;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={`${tab.label}${isFocused ? ", selected" : ""}`}
            style={({ pressed }) => [
              styles.tab,
              isFocused ? styles.tabActive : undefined,
              pressed ? styles.tabPressed : undefined,
            ]}
          >
            <Ionicons
              name={isFocused ? tab.iconFilled : tab.iconOutline}
              size={18}
              color={isFocused ? homeTokens.colors.text.primary : homeTokens.colors.text.muted}
            />
            <Text style={[styles.label, isFocused ? styles.labelActive : undefined]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: homeTokens.colors.bg.surface,
    paddingHorizontal: 7,
    paddingTop: 7,
    borderTopWidth: homeTokens.borderWidth.hairline,
    borderTopColor: homeTokens.colors.wireframe.line,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabActive: {
    backgroundColor: homeTokens.colors.accent.subtle,
  },
  tabPressed: {
    opacity: 0.85,
  },
  label: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontWeight: homeTokens.typography.weight.regular,
    fontSize: 8,
    color: homeTokens.colors.text.muted,
  },
  labelActive: {
    fontWeight: homeTokens.typography.weight.bold,
    color: homeTokens.colors.text.primary,
  },
});
