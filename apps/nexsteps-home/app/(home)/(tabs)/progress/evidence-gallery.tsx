import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, ListCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useEvidenceList } from "@/lib/queries/learning";

const FILTERS = ["All", "Photos", "Files", "Voice"] as const;

function evidenceKind(mimeType: string): (typeof FILTERS)[number] {
  if (mimeType.startsWith("image/")) return "Photos";
  if (mimeType.startsWith("audio/")) return "Voice";
  return "Files";
}

export default function EvidenceGalleryScreen() {
  const evidenceQuery = useEvidenceList();
  const evidence = evidenceQuery.data ?? [];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    if (filter === "All") return evidence;
    return evidence.filter((item) => evidenceKind(item.mimeType) === filter);
  }, [evidence, filter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Progress · Evidence"
          title="Evidence gallery"
          description="Photos, files and voice notes stay attached to learning."
        />

        <ChipRow
          items={[...FILTERS]}
          active={FILTERS.map((f) => f === filter)}
          onPress={(index) => setFilter(FILTERS[index])}
        />

        {evidenceQuery.isError ? (
          <NoticeCard title="Could not load evidence" body="Check your connection and try again." tone="danger" />
        ) : evidenceQuery.isLoading ? (
          <NoticeCard title="Loading" body="Fetching evidence..." />
        ) : filtered.length === 0 ? (
          <NoticeCard title="No evidence yet" body="Evidence attached to learning logs will show up here." />
        ) : (
          <ListCard
            items={filtered.map((item) => ({
              title: item.title,
              detail: `${new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${evidenceKind(item.mimeType)}`,
              onPress: () =>
                router.push({
                  pathname: "/(home)/(tabs)/progress/evidence-detail-upload",
                  params: { id: item.id },
                }),
            }))}
          />
        )}

        <NoticeCard title="Private family record" body="Evidence is not visible to Community members." />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Open learning history"
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
