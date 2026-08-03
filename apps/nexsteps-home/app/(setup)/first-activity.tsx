import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import {
  combineDateAndTime,
  DURATION_OPTIONS,
  formatDayLabel,
  TIME_OPTIONS,
  upcomingDayOptions,
} from "@/lib/date-options";
import { useCreateActivity } from "@/lib/queries/family-planner";
import { useChildren } from "@/lib/queries/children";
import { useCompleteSetup } from "@/lib/queries/household-setup";

const DEFAULT_DAY_INDEX = 1; // "Tomorrow"
const DEFAULT_TIME_INDEX = 1; // "10:00"
const DEFAULT_DURATION_INDEX = 2; // "45 min"

export default function FirstActivityScreen() {
  const childrenQuery = useChildren();
  const children = childrenQuery.data ?? [];
  const createActivity = useCreateActivity();
  const completeSetup = useCompleteSetup();

  const days = useMemo(() => upcomingDayOptions(6), []);
  const [title, setTitle] = useState("");
  const [childIndex, setChildIndex] = useState(0);
  const [dayIndex, setDayIndex] = useState(DEFAULT_DAY_INDEX);
  const [timeIndex, setTimeIndex] = useState(DEFAULT_TIME_INDEX);
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX);

  const selectedChild = children[childIndex];
  const canSave = title.trim().length > 0 && !!selectedChild && !createActivity.isPending;

  const handleSave = () => {
    if (!canSave || !selectedChild) return;
    const scheduledAt = combineDateAndTime(days[dayIndex].date, TIME_OPTIONS[timeIndex]);
    createActivity.mutate(
      {
        childId: selectedChild.id,
        title: title.trim(),
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: DURATION_OPTIONS[durationIndex].minutes,
      },
      {
        onSuccess: () => {
          completeSetup.mutate(undefined, {
            onSuccess: () => router.replace("/(setup)/setup-complete"),
          });
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Setup · 3 of 3"
          title="Plan your first activity"
          description="Give tomorrow one useful anchor. Everything else can wait."
        />

        <FieldInput
          fields={[
            {
              key: "title",
              label: "Activity",
              value: title,
              onChangeText: setTitle,
              placeholder: "Fractions with pancakes",
            },
          ]}
        />

        {childrenQuery.isError ? (
          <NoticeCard title="Could not load your children" body="Check your connection and try again." tone="danger" />
        ) : childrenQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching your household's children..." />
        ) : children.length === 0 ? (
          <NoticeCard title="No children yet" body="Add a child before planning an activity." />
        ) : (
          <ChipRow
            label="Child"
            items={children.map((child) => child.preferredName || child.firstName)}
            active={children.map((_, index) => index === childIndex)}
            onPress={setChildIndex}
          />
        )}

        <ChipRow
          label="Day"
          items={days.map((day) => formatDayLabel(day.date))}
          active={days.map((_, index) => index === dayIndex)}
          onPress={setDayIndex}
        />
        <ChipRow
          label="Time"
          items={TIME_OPTIONS.map((time) => time.label)}
          active={TIME_OPTIONS.map((_, index) => index === timeIndex)}
          onPress={setTimeIndex}
        />
        <ChipRow
          label="Duration"
          items={DURATION_OPTIONS.map((duration) => duration.label)}
          active={DURATION_OPTIONS.map((_, index) => index === durationIndex)}
          onPress={setDurationIndex}
        />

        {createActivity.isError || completeSetup.isError ? (
          <NoticeCard title="Could not save this activity" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createActivity.isPending || completeSetup.isPending ? "Saving..." : "Add to our week"}
          onPrimaryPress={canSave ? handleSave : undefined}
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
