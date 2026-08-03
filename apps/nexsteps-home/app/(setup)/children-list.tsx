import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useChildren } from "@/lib/queries/children";

export default function ChildrenListScreen() {
  const childrenQuery = useChildren();
  const children = childrenQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Setup · 1 of 3"
          title="Who are you organising for?"
          description="Start with one child. Add or change details later."
        />

        {childrenQuery.isError ? (
          <NoticeCard
            title="Could not load your children"
            body="Check your connection and try again."
            tone="danger"
          />
        ) : childrenQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching your household's children..." />
        ) : children.length === 0 ? (
          <NoticeCard
            title="No children yet"
            body="Add your first child below to continue."
          />
        ) : (
          children.map((child) => (
            <ContentCard
              key={child.id}
              title={child.preferredName || child.firstName}
              meta="Child"
            />
          ))
        )}

        <ContentCard
          title="Add another child"
          body="A first name or nickname and age are enough to begin."
          action="Add child"
          tone="mint"
          onPress={() => router.push("/(setup)/child-add")}
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={
            children.length > 0
              ? `Continue with ${children.length} ${children.length === 1 ? "child" : "children"}`
              : "Add a child to continue"
          }
          onPrimaryPress={
            children.length > 0 ? () => router.push("/(setup)/learning-days") : undefined
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
