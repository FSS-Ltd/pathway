import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { learningApi } from "@/lib/api";
import { useReportBundle } from "@/lib/queries/learning";

export default function ReportDetailDownloadScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bundleQuery = useReportBundle(id);

  const [reportText, setReportText] = useState<string | null>(null);
  const [isFetchingText, setIsFetchingText] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const handleViewReport = async () => {
    if (!id) return;
    setIsFetchingText(true);
    setFetchError(false);
    try {
      const text = await learningApi.downloadReportBundleText(id);
      setReportText(text);
    } catch {
      setFetchError(true);
    } finally {
      setIsFetchingText(false);
    }
  };

  if (bundleQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Report draft" title="Could not load this report" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (bundleQuery.isLoading || !bundleQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Report draft" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const bundle = bundleQuery.data;
  const period = `${new Date(bundle.periodStart).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${new Date(
    bundle.periodEnd,
  ).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader eyebrow="Report draft" title={period} description={`Status: ${bundle.status}`} />

        {bundle.status === "READY" ? (
          <NoticeCard
            title="Ready when you are"
            body="View the CSV summary below - select and copy the text to save or share it."
            tone="mint"
          />
        ) : (
          <NoticeCard title="Still generating" body="Check back shortly." tone="neutral" />
        )}

        {fetchError ? (
          <NoticeCard title="Could not load the report" body="Check your connection and try again." tone="danger" />
        ) : null}

        {reportText ? (
          <View style={styles.reportBox}>
            <Text style={styles.reportText} selectable>
              {reportText}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={isFetchingText ? "Loading report..." : "View report"}
          onPrimaryPress={
            bundle.status === "READY" && !isFetchingText ? () => void handleViewReport() : undefined
          }
          secondaryLabel="Back to reports"
          onSecondaryPress={() => router.push("/(home)/(tabs)/progress/reports-list")}
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
  reportBox: {
    padding: homeTokens.layout.cardPadding,
    borderRadius: homeTokens.radius.lg,
    backgroundColor: homeTokens.colors.bg.surface,
  },
  reportText: {
    fontFamily: homeTokens.typography.fontFamily.body,
    fontSize: homeTokens.typography.body.xs.size,
    lineHeight: homeTokens.typography.body.xs.lineHeight,
    color: homeTokens.colors.text.primary,
  },
});
