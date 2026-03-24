import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { mobileTokens } from "@/design/tokens";

export default function FamilyTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mobileTokens.colors.text.primary,
        tabBarInactiveTintColor: mobileTokens.colors.text.subtle,
        tabBarStyle: {
          height: 74,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: mobileTokens.colors.bg.surface,
          borderTopColor: mobileTokens.colors.accent.family,
          borderTopWidth: 3,
        },
        tabBarLabelStyle: {
          fontFamily: mobileTokens.typography.fontFamily.body,
          fontWeight: mobileTokens.typography.weight.semibold,
          fontSize: mobileTokens.typography.body.xs.size,
        },
        tabBarItemStyle: {
          borderRadius: mobileTokens.radius.lg,
          marginHorizontal: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: "Updates",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
