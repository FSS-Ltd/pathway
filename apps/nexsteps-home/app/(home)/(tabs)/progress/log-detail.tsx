import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useEvidenceList, useLearningLog } from "@/lib/queries/learning";
import { useSubjects } from "@/lib/queries/family-planner";

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const logQuery = useLearningLog(id);
  const subjectsQuery = useSubjects();
  const evidenceQuery = useEvidenceList();

  const subjectName = useMemo(() => {
    if (!logQuery.data?.subjectId) return null;
    return subjectsQuery.data?.find((s) => s.id === logQuery.data?.subjectId)?.name ?? null;
  }, [logQuery.data, subjectsQuery.data]);

  const linkedEvidenceCount = useMemo(
    () => (evidenceQuery.data ?? []).filter((item) => item.learningLogId === id).length,
    [evidenceQuery.data, id],
  );

  if (logQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Learning log" title="Could not load this log" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (logQuery.isLoading || !logQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Learning log" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const log = logQuery.data;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Learning log"
          title={log.title}
          description={`${new Date(log.activityDate).toLocaleDateString(undefined, { day: "numeric", month: "long" })}${
            subjectName ? ` · ${subjectName}` : ""
          }`}
        />

        {log.description ? <ContentCard title="What happened" body={log.description} /> : null}

        <ContentCard
          title="Evidence"
          body={`${linkedEvidenceCount} ${linkedEvidenceCount === 1 ? "item" : "items"} attached`}
          action={linkedEvidenceCount > 0 ? "View evidence" : undefined}
          tone="mint"
          onPress={
            linkedEvidenceCount > 0
              ? () => router.push("/(home)/(tabs)/progress/evidence-gallery")
              : undefined
          }
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Back to history"
          onPrimaryPress={() => router.push("/(home)/(tabs)/progress/learning-history")}
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
