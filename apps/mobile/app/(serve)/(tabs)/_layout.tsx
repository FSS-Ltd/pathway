import { Tabs } from "expo-router";

import { ServeBottomNav } from "@/components/navigation/serve-bottom-nav";

export default function ServeTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
        },
      }}
      tabBar={(props) => <ServeBottomNav {...props} />}
    >
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Today",
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
        }}
      />
      <Tabs.Screen
        name="communications"
        options={{
          title: "Pickups",
        }}
      />
      <Tabs.Screen
        name="reporting"
        options={{
          title: "Reports",
          href: null,
        }}
      />
      <Tabs.Screen
        name="safeguarding"
        options={{
          title: "Safeguarding",
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
