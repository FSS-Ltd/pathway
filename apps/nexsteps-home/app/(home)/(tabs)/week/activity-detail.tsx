import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ChipRow, ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { formatTimeLabel } from "@/lib/date-options";
import { useActivities, useChildren, useSubjects } from "@/lib/queries/family-planner";

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activities = useActivities();
  const children = useChildren();
  const subjects = useSubjects();

  const activity = activities.data?.find((a) => a.id === id);
  const child = children.data?.find((c) => c.id === activity?.childId);
  const childName = child?.preferredName ?? child?.firstName ?? "Child";

  if (activities.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={homeTokens.colors.accent.strong} />
        </View>
      </SafeAreaView>
    );
  }

  if (activities.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <NoticeCard
            title="Could not load this activity"
            body="Check your connection and try again."
            tone="danger"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <NoticeCard title="Activity not found" body="It may have been removed." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  const scheduledAt = new Date(activity.scheduledAt);
  const subjectNames = activity.subjectIds
    .map((subjectId) => subjects.data?.find((s) => s.id === subjectId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Activity"
          title={activity.title}
          description={`${scheduledAt.toLocaleDateString("en-GB", { weekday: "long" })} · ${formatTimeLabel(scheduledAt)} · ${childName}`}
        />

        {subjectNames.length > 0 ? <ChipRow items={subjectNames} active={subjectNames.map(() => true)} /> : null}

        {activity.planNotes ? (
          <ContentCard
            title="Plan"
            body={activity.planNotes}
            meta={activity.durationMinutes ? `${activity.durationMinutes} min` : undefined}
          />
        ) : null}

        {activity.resourcesNote ? (
          <ContentCard title="Resources" body={activity.resourcesNote} />
        ) : null}

        <NoticeCard
          title="Ready to begin"
          body="When finished, add a quick learning log and optional evidence."
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Start activity"
          onPrimaryPress={() =>
            router.push({
              pathname: "/(home)/(tabs)/today/quick-log",
              params: { activityId: activity.id },
            })
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
