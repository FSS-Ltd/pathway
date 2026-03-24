import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { mobileTokens } from "@/design/tokens";

export default function ServeTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mobileTokens.colors.text.primary,
        tabBarInactiveTintColor: mobileTokens.colors.text.subtle,
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: mobileTokens.colors.bg.surface,
          borderTopColor: mobileTokens.colors.accent.serve,
          borderTopWidth: 3,
        },
        tabBarLabelStyle: {
          fontFamily: mobileTokens.typography.fontFamily.body,
          fontWeight: mobileTokens.typography.weight.semibold,
          fontSize: 11,
        },
        tabBarItemStyle: {
          borderRadius: mobileTokens.radius.lg,
          marginHorizontal: 2,
        },
      }}
    >
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "checkmark-circle" : "checkmark-circle-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="communications"
        options={{
          title: "Comms",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reporting"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "bar-chart" : "bar-chart-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="safeguarding"
        options={{
          title: "Safeguarding",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "shield-checkmark" : "shield-checkmark-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
