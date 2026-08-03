import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import {
  combineDateAndTime,
  DURATION_OPTIONS,
  formatDayLabel,
  TIME_OPTIONS,
  upcomingDayOptions,
} from "@/lib/date-options";
import { useCreateActivity, useSubjects } from "@/lib/queries/family-planner";
import { useChildren } from "@/lib/queries/children";

export default function ActivityPlanScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const days = useMemo(() => upcomingDayOptions(6, date ? new Date(date) : new Date()), [date]);

  const children = useChildren();
  const subjects = useSubjects();
  const createActivity = useCreateActivity();

  const [title, setTitle] = useState("");
  const [childId, setChildId] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);
  const [selectedDurationIndex, setSelectedDurationIndex] = useState<number | null>(null);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [planNotes, setPlanNotes] = useState("");
  const [resourcesNote, setResourcesNote] = useState("");

  const canSave = title.trim().length > 0 && childId && selectedTimeIndex !== null;

  const handleSave = () => {
    if (!canSave || childId === null || selectedTimeIndex === null) return;
    const scheduledAt = combineDateAndTime(days[selectedDayIndex].date, TIME_OPTIONS[selectedTimeIndex]);
    createActivity.mutate(
      {
        childId,
        title: title.trim(),
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes:
          selectedDurationIndex !== null ? DURATION_OPTIONS[selectedDurationIndex].minutes : undefined,
        subjectIds: subjectIds.length > 0 ? subjectIds : undefined,
        planNotes: planNotes.trim() || undefined,
        resourcesNote: resourcesNote.trim() || undefined,
      },
      {
        onSuccess: (activity) => {
          router.replace({
            pathname: "/(home)/(tabs)/week/activity-detail",
            params: { id: activity.id },
          });
        },
      },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Plan activity"
          title="Add learning to the week"
          description="Only the essentials are required."
        />

        <FieldInput
          fields={[
            {
              key: "title",
              label: "Activity",
              value: title,
              onChangeText: setTitle,
              placeholder: "Nature journal walk",
            },
          ]}
        />

        {children.isLoading ? <ActivityIndicator color={homeTokens.colors.accent.strong} /> : null}
        {children.isError ? (
          <NoticeCard title="Could not load children" body="Check your connection and try again." tone="danger" />
        ) : null}
        {children.data && children.data.length === 0 ? (
          <NoticeCard
            title="No children yet"
            body="Add a child in Family settings before planning an activity."
            tone="yellow"
          />
        ) : null}
        {children.data && children.data.length > 0 ? (
          <ChipRow
            label="Child"
            items={children.data.map((c) => c.preferredName ?? c.firstName)}
            active={children.data.map((c) => c.id === childId)}
            onPress={(index) => setChildId(children.data![index].id)}
          />
        ) : null}

        <ChipRow
          label="Date"
          items={days.map((d) => formatDayLabel(d.date))}
          active={days.map((_, index) => index === selectedDayIndex)}
          onPress={setSelectedDayIndex}
        />
        <ChipRow
          label="Time"
          items={TIME_OPTIONS.map((t) => t.label)}
          active={TIME_OPTIONS.map((_, index) => index === selectedTimeIndex)}
          onPress={setSelectedTimeIndex}
        />
        <ChipRow
          label="Duration"
          items={DURATION_OPTIONS.map((d) => d.label)}
          active={DURATION_OPTIONS.map((_, index) => index === selectedDurationIndex)}
          onPress={setSelectedDurationIndex}
        />
        {subjects.data && subjects.data.length > 0 ? (
          <ChipRow
            label="Subjects"
            items={subjects.data.map((s) => s.name)}
            active={subjects.data.map((s) => subjectIds.includes(s.id))}
            onPress={(index) => {
              const id = subjects.data![index].id;
              setSubjectIds((current) =>
                current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
              );
            }}
          />
        ) : null}

        <FieldInput
          fields={[
            {
              key: "notes",
              label: "Plan (optional)",
              value: planNotes,
              onChangeText: setPlanNotes,
              placeholder: "Notice three plants, sketch one and write two observations.",
              multiline: true,
            },
            {
              key: "resources",
              label: "Resources (optional)",
              value: resourcesNote,
              onChangeText: setResourcesNote,
              placeholder: "Notebook, pencils and phone camera.",
            },
          ]}
        />

        {createActivity.isError ? (
          <NoticeCard
            title="Could not save this activity"
            body="Check your connection and try again."
            tone="danger"
          />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createActivity.isPending ? "Saving..." : "Save activity"}
          onPrimaryPress={canSave && !createActivity.isPending ? handleSave : undefined}
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
