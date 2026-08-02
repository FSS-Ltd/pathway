import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { combineDateAndTime, formatDayLabel, TIME_OPTIONS, upcomingDayOptions } from "@/lib/date-options";
import { useCreateTask } from "@/lib/queries/family-planner";
import type { TaskPriority } from "@/lib/api/family-planner";

const PRIORITY_OPTIONS: { label: string; value: TaskPriority }[] = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "Important", value: "IMPORTANT" },
];

export default function TaskEditorScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const days = useMemo(() => upcomingDayOptions(6, date ? new Date(date) : new Date()), [date]);

  const createTask = useCreateTask();

  const [title, setTitle] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);
  const [priorityIndex, setPriorityIndex] = useState(1);

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const dueAt =
      selectedTimeIndex !== null
        ? combineDateAndTime(days[selectedDayIndex].date, TIME_OPTIONS[selectedTimeIndex])
        : undefined;
    createTask.mutate(
      {
        title: title.trim(),
        dueAt: dueAt?.toISOString(),
        priority: PRIORITY_OPTIONS[priorityIndex].value,
      },
      { onSuccess: () => router.replace("/(home)/(tabs)/week") },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Task"
          title="Add a family task"
          description="Keep work around learning visible, without over-planning."
        />

        <FieldInput
          fields={[
            {
              key: "title",
              label: "Task",
              value: title,
              onChangeText: setTitle,
              placeholder: "Renew library books",
            },
          ]}
        />

        <ChipRow
          label="Due date"
          items={days.map((d) => formatDayLabel(d.date))}
          active={days.map((_, index) => index === selectedDayIndex)}
          onPress={setSelectedDayIndex}
        />
        <ChipRow
          label="Due time"
          items={TIME_OPTIONS.map((t) => t.label)}
          active={TIME_OPTIONS.map((_, index) => index === selectedTimeIndex)}
          onPress={setSelectedTimeIndex}
        />
        <ChipRow
          label="Priority"
          items={PRIORITY_OPTIONS.map((p) => p.label)}
          active={PRIORITY_OPTIONS.map((_, index) => index === priorityIndex)}
          onPress={setPriorityIndex}
        />

        {createTask.isError ? (
          <NoticeCard title="Could not save this task" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createTask.isPending ? "Saving..." : "Save task"}
          onPrimaryPress={canSave && !createTask.isPending ? handleSave : undefined}
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
