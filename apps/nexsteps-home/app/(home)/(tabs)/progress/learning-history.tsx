import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, ListCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useLearningLogs } from "@/lib/queries/learning";
import { useSubjects } from "@/lib/queries/family-planner";

const ALL_SUBJECTS = "All";

function formatLogDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function LearningHistoryScreen() {
  const logsQuery = useLearningLogs();
  const subjectsQuery = useSubjects();
  const logs = logsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];

  const [selectedSubject, setSelectedSubject] = useState(ALL_SUBJECTS);
  const subjectNameById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject.name])),
    [subjects],
  );
  const chipLabels = [ALL_SUBJECTS, ...subjects.map((s) => s.name)];

  const filteredLogs = useMemo(() => {
    if (selectedSubject === ALL_SUBJECTS) return logs;
    return logs.filter((log) => subjectNameById.get(log.subjectId ?? "") === selectedSubject);
  }, [logs, selectedSubject, subjectNameById]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Progress · History"
          title="Learning history"
          description="Searchable, chronological and easy to evidence."
        />

        <ChipRow
          items={chipLabels}
          active={chipLabels.map((label) => label === selectedSubject)}
          onPress={(index) => setSelectedSubject(chipLabels[index])}
        />

        {logsQuery.isError ? (
          <NoticeCard title="Could not load learning history" body="Check your connection and try again." tone="danger" />
        ) : logsQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching learning logs..." />
        ) : filteredLogs.length === 0 ? (
          <NoticeCard title="No learning logs yet" body="Logs you add from Today will show up here." />
        ) : (
          <ListCard
            items={filteredLogs.map((log) => ({
              title: log.title,
              detail: `${formatLogDate(log.activityDate)}${
                subjectNameById.get(log.subjectId ?? "") ? ` · ${subjectNameById.get(log.subjectId ?? "")}` : ""
              }`,
              onPress: () =>
                router.push({
                  pathname: "/(home)/(tabs)/progress/log-detail",
                  params: { id: log.id },
                }),
            }))}
          />
        )}
      </ScrollView>

      {logs.length > 0 ? (
        <View style={styles.actions}>
          <ScreenActions
            primaryLabel="Open latest log"
            onPrimaryPress={() =>
              router.push({
                pathname: "/(home)/(tabs)/progress/log-detail",
                params: { id: logs[0].id },
              })
            }
          />
        </View>
      ) : null}
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
