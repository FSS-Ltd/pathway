import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader, WeekStrip } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { formatDayLabel, formatTimeLabel, isSameDay, upcomingDayOptions } from "@/lib/date-options";
import { useActivities, useCalendarItems, useTasks } from "@/lib/queries/family-planner";
import { useChildren } from "@/lib/queries/children";

export default function WeekScreen() {
  const days = useMemo(() => upcomingDayOptions(5), []);
  const [selectedDate, setSelectedDate] = useState(days[0].date);

  const activities = useActivities();
  const tasks = useTasks();
  const calendarItems = useCalendarItems();
  const children = useChildren();

  const isLoading = activities.isLoading || tasks.isLoading || calendarItems.isLoading;
  const isError = activities.isError || tasks.isError || calendarItems.isError;

  const weekDays = days.map((day) => {
    const count =
      (activities.data?.filter((a) => isSameDay(new Date(a.scheduledAt), day.date)).length ?? 0) +
      (tasks.data?.filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), day.date)).length ?? 0) +
      (calendarItems.data?.filter((c) => isSameDay(new Date(c.scheduledAt), day.date)).length ?? 0);
    return { day: formatDayLabel(day.date), date: String(day.date.getDate()), count };
  });

  const dayActivities = (activities.data ?? []).filter((a) =>
    isSameDay(new Date(a.scheduledAt), selectedDate),
  );
  const dayTasks = (tasks.data ?? []).filter(
    (t) => t.dueAt && isSameDay(new Date(t.dueAt), selectedDate),
  );
  const dayCalendarItems = (calendarItems.data ?? []).filter((c) =>
    isSameDay(new Date(c.scheduledAt), selectedDate),
  );
  const childName = (childId: string) =>
    children.data?.find((c) => c.id === childId)?.preferredName ??
    children.data?.find((c) => c.id === childId)?.firstName ??
    "Child";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Week"
          title={formatWeekRange(days[0].date, days[days.length - 1].date)}
          description="A single view of learning, tasks and family commitments."
        />

        <WeekStrip
          activeDay={formatDayLabel(selectedDate)}
          days={weekDays}
          onSelectDay={(selected) => {
            // 5-day window: Today/Tomorrow/weekday-name labels never repeat within it.
            const match = days.find((day) => formatDayLabel(day.date) === selected.day);
            if (match) setSelectedDate(match.date);
          }}
        />

        {isLoading ? <ActivityIndicator color={homeTokens.colors.accent.strong} /> : null}
        {isError ? (
          <NoticeCard
            title="Could not load your week"
            body="Check your connection and try again."
            tone="danger"
          />
        ) : null}

        {!isLoading && !isError && dayActivities.length === 0 && dayTasks.length === 0 && dayCalendarItems.length === 0 ? (
          <NoticeCard
            title="Nothing planned yet"
            body="Add a learning activity, task or calendar item to this day."
          />
        ) : null}

        {dayActivities.map((activity) => (
          <ContentCard
            key={activity.id}
            title={`${formatTimeLabel(new Date(activity.scheduledAt))} · ${activity.title}`}
            body={`${childName(activity.childId)}${activity.durationMinutes ? ` · ${activity.durationMinutes} minutes` : ""}`}
            meta="Learning"
            action="Open"
            tone="mint"
            onPress={() =>
              router.push({
                pathname: "/(home)/(tabs)/week/activity-detail",
                params: { id: activity.id },
              })
            }
          />
        ))}
        {dayCalendarItems.map((item) => (
          <ContentCard
            key={item.id}
            title={`${formatTimeLabel(new Date(item.scheduledAt))} · ${item.title}`}
            body={item.who ?? undefined}
            meta="Calendar"
          />
        ))}
        {dayTasks.map((task) => (
          <ContentCard key={task.id} title={task.title} meta="Task" tone="yellow" />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Add to week"
          onPrimaryPress={() =>
            router.push({
              pathname: "/(home)/(tabs)/week/day-detail",
              params: { date: selectedDate.toISOString() },
            })
          }
        />
      </View>
    </SafeAreaView>
  );
}

function formatWeekRange(start: Date, end: Date): string {
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${startLabel} - ${endLabel}`;
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
