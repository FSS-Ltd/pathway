import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useChildren } from "@/lib/queries/children";
import { useCreateReportBundle } from "@/lib/queries/learning";

type PeriodOption = { label: string; days: number };

const PERIOD_OPTIONS: PeriodOption[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "This year", days: 365 },
];

export default function ReportRequestScreen() {
  const childrenQuery = useChildren();
  const children = childrenQuery.data ?? [];
  const createReportBundle = useCreateReportBundle();

  const [childIndex, setChildIndex] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0);

  const selectedChild = children[childIndex];
  const period = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - PERIOD_OPTIONS[periodIndex].days);
    return { start, end };
  }, [periodIndex]);

  const canGenerate = !!selectedChild && !createReportBundle.isPending;

  const handleGenerate = () => {
    if (!selectedChild) return;
    createReportBundle.mutate(
      {
        childId: selectedChild.id,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      },
      {
        onSuccess: (bundle) =>
          router.replace({
            pathname: "/(home)/(tabs)/progress/report-detail-download",
            params: { id: bundle.id },
          }),
      },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Create report"
          title="Choose what to include"
          description="Start broad, then edit the generated summary."
        />

        {childrenQuery.isError ? (
          <NoticeCard title="Could not load your children" body="Check your connection and try again." tone="danger" />
        ) : childrenQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching your household's children..." />
        ) : children.length === 0 ? (
          <NoticeCard title="No children yet" body="Add a child before creating a report." />
        ) : (
          <ChipRow
            label="Child"
            items={children.map((child) => child.preferredName || child.firstName)}
            active={children.map((_, index) => index === childIndex)}
            onPress={setChildIndex}
          />
        )}

        <ChipRow
          label="Period"
          items={PERIOD_OPTIONS.map((option) => option.label)}
          active={PERIOD_OPTIONS.map((_, index) => index === periodIndex)}
          onPress={setPeriodIndex}
        />

        <NoticeCard
          title="Generated from your real learning record"
          body="A CSV summary of every learning log in this period, ready to review."
        />

        {createReportBundle.isError ? (
          <NoticeCard title="Could not generate this report" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createReportBundle.isPending ? "Generating..." : "Generate draft report"}
          onPrimaryPress={canGenerate ? handleGenerate : undefined}
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
