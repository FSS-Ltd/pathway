import { Tabs } from "expo-router";

import { ServeBottomNav } from "@/components/navigation/serve-bottom-nav";
import { useAppReady } from "@/hooks/use-app-ready";

export default function ServeTabsLayout() {
  const { bootstrapState } = useAppReady();
  const permissions =
    bootstrapState.status === "ready" ? bootstrapState.permissions : [];
  const canReadBehaviour = permissions.includes("ace.behaviour.read");
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <ServeBottomNav {...props} permissions={permissions} />
      )}
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
        name="pace"
        options={{
          title: "PACE",
          tabBarAccessibilityLabel: "PACE assessments",
        }}
      />
      <Tabs.Screen
        name="behaviour"
        options={{
          title: "Behaviour",
          tabBarAccessibilityLabel: "Behaviour capture",
          href: canReadBehaviour ? undefined : null,
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
