import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader, StatRow } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { formatTimeLabel, isSameDay } from "@/lib/date-options";
import { useActivities, useCalendarItems, useChildren, useTasks } from "@/lib/queries/family-planner";

export default function TodayScreen() {
  const today = new Date();
  const activities = useActivities();
  const tasks = useTasks();
  const calendarItems = useCalendarItems();
  const children = useChildren();

  const isLoading = activities.isLoading || tasks.isLoading || calendarItems.isLoading;
  const isError = activities.isError || tasks.isError || calendarItems.isError;

  const childName = (childId: string) =>
    children.data?.find((c) => c.id === childId)?.preferredName ??
    children.data?.find((c) => c.id === childId)?.firstName ??
    "Child";

  const todayActivities = (activities.data ?? []).filter((a) =>
    isSameDay(new Date(a.scheduledAt), today),
  );
  const todayTasks = (tasks.data ?? []).filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), today));
  const todayCalendarItems = (calendarItems.data ?? []).filter((c) =>
    isSameDay(new Date(c.scheduledAt), today),
  );

  const upcoming = [
    ...todayActivities.map((a) => ({
      key: `activity-${a.id}`,
      time: new Date(a.scheduledAt),
      title: a.title,
      body: `${childName(a.childId)}${a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}`,
      meta: undefined as string | undefined,
      action: "Open",
      onPress: () =>
        router.push({ pathname: "/(home)/(tabs)/week/activity-detail", params: { id: a.id } }),
    })),
    ...todayCalendarItems.map((c) => ({
      key: `calendar-${c.id}`,
      time: new Date(c.scheduledAt),
      title: c.title,
      body: c.who ?? undefined,
      meta: "Calendar",
      action: undefined as string | undefined,
      onPress: undefined,
    })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  const next = upcoming[0];
  const later = upcoming[1];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Today"
          title="Good morning"
          description="Here is what deserves your attention today."
        />

        {isLoading ? <ActivityIndicator color={homeTokens.colors.accent.strong} /> : null}
        {isError ? (
          <NoticeCard title="Could not load today" body="Check your connection and try again." tone="danger" />
        ) : null}

        {!isLoading && !isError ? (
          <StatRow
            items={[
              { value: String(todayActivities.length), label: "Learning" },
              { value: String(todayTasks.length), label: "Task" },
              { value: String(todayCalendarItems.length), label: "Appointment" },
            ]}
          />
        ) : null}

        {next ? (
          <ContentCard
            title={`Next · ${formatTimeLabel(next.time)}`}
            body={`${next.title}${next.body ? `\n${next.body}` : ""}`}
            meta={next.meta}
            action={next.action}
            tone="mint"
            onPress={next.onPress}
          />
        ) : null}
        {later ? (
          <ContentCard
            title={`Later · ${formatTimeLabel(later.time)}`}
            body={`${later.title}${later.body ? ` · ${later.body}` : ""}`}
            meta={later.meta}
            action={later.action}
            onPress={later.onPress}
          />
        ) : null}

        {!isLoading && !isError && upcoming.length === 0 ? (
          <NoticeCard title="Nothing planned for today" body="Plan a learning activity from the Week tab." />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Log learning"
          onPrimaryPress={() => router.push("/(home)/(tabs)/today/quick-log")}
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
