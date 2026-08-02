import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ListCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { formatTimeLabel, isSameDay } from "@/lib/date-options";
import { useActivities, useCalendarItems, useChildren, useTasks } from "@/lib/queries/family-planner";

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const day = date ? new Date(date) : new Date();

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

  const items = [
    ...(activities.data ?? [])
      .filter((a) => isSameDay(new Date(a.scheduledAt), day))
      .map((a) => ({
        title: a.title,
        detail: `${formatTimeLabel(new Date(a.scheduledAt))} · ${childName(a.childId)}`,
        meta: "Learning",
        time: new Date(a.scheduledAt).getTime(),
        onPress: () =>
          router.push({ pathname: "/(home)/(tabs)/week/activity-detail", params: { id: a.id } }),
      })),
    ...(calendarItems.data ?? [])
      .filter((c) => isSameDay(new Date(c.scheduledAt), day))
      .map((c) => ({
        title: c.title,
        detail: `${formatTimeLabel(new Date(c.scheduledAt))}${c.who ? ` · ${c.who}` : ""}`,
        meta: "Calendar",
        time: new Date(c.scheduledAt).getTime(),
        onPress: undefined,
      })),
    ...(tasks.data ?? [])
      .filter((t) => t.dueAt && isSameDay(new Date(t.dueAt), day))
      .map((t) => ({
        title: t.title,
        detail: t.dueAt ? `Due ${formatTimeLabel(new Date(t.dueAt))}` : "Task",
        meta: "Task",
        time: t.dueAt ? new Date(t.dueAt).getTime() : 0,
        onPress: undefined,
      })),
  ].sort((a, b) => a.time - b.time);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow={`Week · ${day.toLocaleDateString("en-GB", { weekday: "long" })}`}
          title={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          description="Everything for the day, ordered by time and importance."
        />

        {isLoading ? <ActivityIndicator color={homeTokens.colors.accent.strong} /> : null}

        {!isLoading && isError ? (
          <NoticeCard title="Could not load this day" body="Check your connection and try again." tone="danger" />
        ) : null}

        {!isLoading && !isError && items.length === 0 ? (
          <NoticeCard title="Nothing planned yet" body="Plan an activity to fill this day." />
        ) : null}

        {items.length > 0 ? <ListCard title="Planned" items={items} /> : null}

        {items.length >= 2 ? (
          <NoticeCard
            title="Keep the day realistic"
            body="Two learning activities is the suggested maximum for one day."
            tone="yellow"
          />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Plan activity"
          onPrimaryPress={() =>
            router.push({
              pathname: "/(home)/(tabs)/week/activity-plan",
              params: { date: day.toISOString() },
            })
          }
          secondaryLabel="Add task or calendar item"
          onSecondaryPress={() =>
            router.push({
              pathname: "/(home)/(tabs)/week/task-editor",
              params: { date: day.toISOString() },
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
    gap: homeTokens.spacing.xs,
  },
});
