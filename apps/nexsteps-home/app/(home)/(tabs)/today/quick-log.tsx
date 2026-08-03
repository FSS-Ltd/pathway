import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ChipRow, FieldGroup, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useActivities, useCreateLearningLog, useSubjects } from "@/lib/queries/family-planner";
import { useChildren } from "@/lib/queries/children";

const OUTCOME_OPTIONS = ["Confident", "Needed help", "Try again"];

export default function QuickLogScreen() {
  const { activityId } = useLocalSearchParams<{ activityId?: string }>();
  const activities = useActivities();
  const children = useChildren();
  const subjects = useSubjects();
  const createLog = useCreateLearningLog();

  const linkedActivity = activityId ? activities.data?.find((a) => a.id === activityId) : undefined;

  const [childId, setChildId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [outcomeIndex, setOutcomeIndex] = useState<number | null>(null);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  const effectiveChildId = linkedActivity?.childId ?? childId;
  const canSave = effectiveChildId && description.trim().length > 0;

  const handleSave = () => {
    if (!canSave || !effectiveChildId) return;
    const outcome = outcomeIndex !== null ? OUTCOME_OPTIONS[outcomeIndex] : undefined;
    createLog.mutate(
      {
        childId: effectiveChildId,
        subjectId: subjectIds[0],
        activityId: linkedActivity?.id,
        activityDate: new Date().toISOString(),
        title: linkedActivity?.title ?? "Learning log",
        description: outcome ? `${outcome}: ${description.trim()}` : description.trim(),
      },
      {
        onSuccess: () => router.replace("/(home)/(tabs)/today"),
      },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Quick learning log"
          title="What happened?"
          description="Capture the useful record in under a minute."
        />

        {linkedActivity ? (
          <FieldGroup fields={[{ label: "Activity", value: linkedActivity.title }]} />
        ) : null}

        {!linkedActivity && children.isLoading ? (
          <ActivityIndicator color={homeTokens.colors.accent.strong} />
        ) : null}
        {!linkedActivity && children.isError ? (
          <NoticeCard title="Could not load children" body="Check your connection and try again." tone="danger" />
        ) : null}
        {!linkedActivity && children.data && children.data.length > 0 ? (
          <ChipRow
            label="Child"
            items={children.data.map((c) => c.preferredName ?? c.firstName)}
            active={children.data.map((c) => c.id === childId)}
            onPress={(index) => setChildId(children.data![index].id)}
          />
        ) : null}
        {!linkedActivity && children.data && children.data.length === 0 ? (
          <NoticeCard title="No children yet" body="Add a child in Family settings first." tone="yellow" />
        ) : null}

        <FieldInput
          fields={[
            {
              key: "description",
              label: linkedActivity ? `What ${childDisplayName(children.data, effectiveChildId)} did` : "What happened",
              value: description,
              onChangeText: setDescription,
              placeholder: "Compared halves, quarters and eighths while cooking.",
              multiline: true,
            },
          ]}
        />

        <ChipRow
          label="How did it go?"
          items={OUTCOME_OPTIONS}
          active={OUTCOME_OPTIONS.map((_, index) => index === outcomeIndex)}
          onPress={setOutcomeIndex}
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

        {createLog.isError ? (
          <NoticeCard title="Could not save this log" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createLog.isPending ? "Saving..." : "Save learning log"}
          onPrimaryPress={canSave && !createLog.isPending ? handleSave : undefined}
        />
      </View>
    </SafeAreaView>
  );
}

function childDisplayName(
  children: { id: string; firstName: string; preferredName: string | null }[] | undefined,
  childId: string | null,
): string {
  const child = children?.find((c) => c.id === childId);
  return child?.preferredName ?? child?.firstName ?? "your child";
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
