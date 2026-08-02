import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useReportBundles } from "@/lib/queries/learning";

function formatPeriod(start: string, end: string): string {
  const fmt = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function ReportsListScreen() {
  const reportsQuery = useReportBundles();
  const reports = reportsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Progress · Reports"
          title="Learning reports"
          description="Create clear summaries for your family or local authority."
        />

        {reportsQuery.isError ? (
          <NoticeCard title="Could not load reports" body="Check your connection and try again." tone="danger" />
        ) : reportsQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching your reports..." />
        ) : reports.length === 0 ? (
          <NoticeCard title="No reports yet" body="Create your first report below." />
        ) : (
          reports.map((report) => (
            <ContentCard
              key={report.id}
              title={formatPeriod(report.periodStart, report.periodEnd)}
              body={report.status === "READY" ? "Ready to view" : "Generating..."}
              meta={report.status === "READY" ? "Ready" : report.status}
              action={report.status === "READY" ? "Open report" : undefined}
              tone={report.status === "READY" ? "mint" : "neutral"}
              onPress={
                report.status === "READY"
                  ? () =>
                      router.push({
                        pathname: "/(home)/(tabs)/progress/report-detail-download",
                        params: { id: report.id },
                      })
                  : undefined
              }
            />
          ))
        )}

        <NoticeCard
          title="You stay in control"
          body="Review the generated summary before you share it."
          tone="yellow"
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Create a report"
          onPrimaryPress={() => router.push("/(home)/(tabs)/progress/report-request")}
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
