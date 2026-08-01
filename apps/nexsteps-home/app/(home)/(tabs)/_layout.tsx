import { Tabs } from "expo-router";

import { HOME_TABS, HomeTabBar } from "@/components/navigation/home-tab-bar";

export default function HomeTabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { position: "absolute" } }}
      tabBar={(props) => <HomeTabBar {...props} />}
    >
      {HOME_TABS.map((tab) => (
        <Tabs.Screen key={tab.routeName} name={tab.routeName} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
