import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { FieldGroup, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { useEvidenceItem } from "@/lib/queries/learning";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Deliberately view-only: no image-picker/document-picker/audio-recording
 * dependency exists anywhere in this monorepo, and adding one is a real,
 * separate piece of native-capability work (camera roll permissions across
 * iOS/Android/web), not something this plan builds speculatively. Matches
 * Plan 06's precedent of omitting a non-functional "Add evidence" action
 * rather than shipping a dead button - see build-plans/PROGRESS.md.
 */
export default function EvidenceDetailUploadScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const evidenceQuery = useEvidenceItem(id);

  if (evidenceQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Evidence" title="Could not load this item" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (evidenceQuery.isLoading || !evidenceQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Evidence" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const evidence = evidenceQuery.data;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Evidence"
          title={evidence.title}
          description={`${evidence.mimeType} · ${new Date(evidence.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
        />

        <NoticeCard
          title="Stored privately"
          body={`${formatBytes(evidence.byteSize)} · not visible to Community members`}
        />

        <FieldGroup
          fields={[
            { label: "File type", value: evidence.mimeType },
            { label: "Size", value: formatBytes(evidence.byteSize) },
            {
              label: "Captured",
              value: evidence.capturedAt
                ? new Date(evidence.capturedAt).toLocaleDateString()
                : "Not recorded",
            },
          ]}
        />
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel="Back to gallery"
          onPrimaryPress={() => router.push("/(home)/(tabs)/progress/evidence-gallery")}
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
