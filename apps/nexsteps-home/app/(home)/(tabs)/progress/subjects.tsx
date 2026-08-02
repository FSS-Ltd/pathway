import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, FieldInput, ListCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useCreateSubject, useEvidenceList, useLearningLogs } from "@/lib/queries/learning";
import { useSubjects } from "@/lib/queries/family-planner";

export default function SubjectsScreen() {
  const subjectsQuery = useSubjects();
  const logsQuery = useLearningLogs();
  const evidenceQuery = useEvidenceList();
  const createSubject = useCreateSubject();

  const subjects = subjectsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const evidence = evidenceQuery.data ?? [];

  const [isAdding, setIsAdding] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, { logs: number; evidence: number }>();
    for (const subject of subjects) map.set(subject.id, { logs: 0, evidence: 0 });
    for (const log of logs) {
      if (!log.subjectId || !map.has(log.subjectId)) continue;
      map.get(log.subjectId)!.logs += 1;
    }
    for (const item of evidence) {
      const log = logs.find((l) => l.id === item.learningLogId);
      if (!log?.subjectId || !map.has(log.subjectId)) continue;
      map.get(log.subjectId)!.evidence += 1;
    }
    return map;
  }, [subjects, logs, evidence]);

  const handleAddSubject = () => {
    if (!newSubjectName.trim()) return;
    createSubject.mutate(newSubjectName.trim(), {
      onSuccess: () => {
        setNewSubjectName("");
        setIsAdding(false);
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Progress · Subjects"
          title="Learning across subjects"
          description="Subjects organise the record without constraining activities."
        />

        {subjectsQuery.isError ? (
          <NoticeCard title="Could not load subjects" body="Check your connection and try again." tone="danger" />
        ) : subjectsQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching subjects..." />
        ) : subjects.length === 0 ? (
          <NoticeCard title="No subjects yet" body="Add your first subject below." />
        ) : (
          <ListCard
            items={subjects.map((subject) => {
              const count = counts.get(subject.id) ?? { logs: 0, evidence: 0 };
              return {
                title: subject.name,
                detail: `${count.logs} logs · ${count.evidence} evidence items`,
                onPress: () => router.push("/(home)/(tabs)/progress/learning-history"),
              };
            })}
          />
        )}

        {isAdding ? (
          <FieldInput
            fields={[
              {
                key: "name",
                label: "Subject name",
                value: newSubjectName,
                onChangeText: setNewSubjectName,
                placeholder: "e.g. Art",
              },
            ]}
          />
        ) : (
          <ContentCard
            title="Add a subject"
            body="Use your own name or choose a common subject."
            action="Add subject"
            onPress={() => setIsAdding(true)}
          />
        )}

        {createSubject.isError ? (
          <NoticeCard title="Could not save this subject" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      {isAdding ? (
        <View style={styles.actions}>
          <ScreenActions
            primaryLabel={createSubject.isPending ? "Saving..." : "Save subject"}
            onPrimaryPress={
              newSubjectName.trim() && !createSubject.isPending ? handleAddSubject : undefined
            }
            secondaryLabel="Cancel"
            onSecondaryPress={() => {
              setIsAdding(false);
              setNewSubjectName("");
            }}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <ScreenActions
            primaryLabel="Open learning history"
            onPrimaryPress={() => router.push("/(home)/(tabs)/progress/learning-history")}
          />
        </View>
      )}
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
