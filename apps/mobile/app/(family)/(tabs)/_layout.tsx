import { Tabs } from "expo-router";

import { FamilyBottomNav } from "@/components/navigation/family-bottom-nav";

export default function FamilyTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
        },
      }}
      tabBar={(props) => <FamilyBottomNav {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Dashboard",
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: "Notices",
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
