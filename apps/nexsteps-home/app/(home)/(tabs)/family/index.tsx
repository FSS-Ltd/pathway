import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useChildren } from "@/lib/queries/children";

export default function FamilyChildrenScreen() {
  const { data: children, isLoading, isError } = useChildren();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family"
          title="Children"
          description="Private profiles that shape planning and progress."
        />

        {isError ? (
          <NoticeCard title="Couldn't load children" body="Check your connection and try again." tone="danger" />
        ) : isLoading ? (
          <NoticeCard title="Loading" body="Fetching your children." />
        ) : children && children.length === 0 ? (
          <NoticeCard title="Add your first child" body="A name or nickname is enough to get started." />
        ) : (
          children?.map((child) => (
            <ContentCard
              key={child.id}
              title={child.preferredName || child.firstName}
              body={child.yearGroup ?? undefined}
              action="Open"
              tone="mint"
              onPress={() =>
                router.push({
                  pathname: "/(home)/(tabs)/family/child-details",
                  params: { childId: child.id },
                })
              }
            />
          ))
        )}

        <ContentCard
          title="Add a child"
          body="A name or nickname is enough."
          action="Add child"
          tone="yellow"
          onPress={() => router.push("/(setup)/child-add")}
        />

        <NoticeCard
          title="Never shared to Community"
          body="Child profiles and records stay inside the family account."
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={children?.[0] ? `Open ${children[0].preferredName || children[0].firstName}` : "Add a child"}
          onPrimaryPress={() =>
            children?.[0]
              ? router.push({
                  pathname: "/(home)/(tabs)/family/child-details",
                  params: { childId: children[0].id },
                })
              : router.push("/(setup)/child-add")
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: homeTokens.colors.bg.shell,
  },
  content: {
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingTop: homeTokens.metrics.screenContentTop,
    paddingBottom: homeTokens.metrics.tabBarAwareBottomPadding,
    gap: homeTokens.metrics.blockGap,
  },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: homeTokens.layout.screenHorizontalPadding,
    paddingBottom: homeTokens.metrics.blockGap,
  },
});
