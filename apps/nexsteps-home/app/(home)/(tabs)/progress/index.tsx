import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader, StatRow } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useEvidenceList, useLearningLogs, useReportBundles } from "@/lib/queries/learning";
import { useSubjects } from "@/lib/queries/family-planner";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ProgressOverviewScreen() {
  const logsQuery = useLearningLogs();
  const evidenceQuery = useEvidenceList();
  const subjectsQuery = useSubjects();
  const reportsQuery = useReportBundles();

  const logs = logsQuery.data ?? [];
  const evidence = evidenceQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];

  const logsThisWeek = useMemo(() => {
    const cutoff = Date.now() - ONE_WEEK_MS;
    return logs.filter((log) => new Date(log.activityDate).getTime() >= cutoff);
  }, [logs]);

  const readyReport = reports.find((report) => report.status === "READY");
  const isError = logsQuery.isError || evidenceQuery.isError || subjectsQuery.isError;
  const isLoading = logsQuery.isLoading || evidenceQuery.isLoading || subjectsQuery.isLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Progress"
          title="A growing record of learning"
          description="See patterns without reducing learning to scores."
        />

        {isError ? (
          <NoticeCard title="Could not load your progress" body="Check your connection and try again." tone="danger" />
        ) : isLoading ? (
          <NoticeCard title="Loading" body="Fetching your learning record..." />
        ) : (
          <>
            <StatRow
              items={[
                { value: String(logs.length), label: "Logs" },
                { value: String(evidence.length), label: "Evidence" },
                { value: String(subjects.length), label: "Subjects" },
              ]}
            />
            <ContentCard
              title="This week"
              body={`${logsThisWeek.length} learning ${logsThisWeek.length === 1 ? "log" : "logs"}`}
              meta="Active"
              action="View history"
              tone="mint"
              onPress={() => router.push("/(home)/(tabs)/progress/learning-history")}
            />
            {readyReport ? (
              <ContentCard
                title="Latest report"
                body={`${readyReport.periodStart.slice(0, 10)} to ${readyReport.periodEnd.slice(0, 10)}`}
                meta="Ready"
                action="Open report"
                tone="yellow"
                onPress={() =>
                  router.push({
                    pathname: "/(home)/(tabs)/progress/report-detail-download",
                    params: { id: readyReport.id },
                  })
                }
              />
            ) : (
              <ContentCard
                title="No reports yet"
                body="Generate a summary of learning for any period."
                action="Create report"
                tone="yellow"
                onPress={() => router.push("/(home)/(tabs)/progress/report-request")}
              />
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="View learning history"
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
