import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ContentCard,
  FieldInput,
  ListCard,
  NoticeCard,
  ScreenActions,
  ScreenHeader,
  type ListCardItem,
} from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { isDeniedError } from "@/lib/api";
import type { DataExportKind, DataExportRequest, DataExportStatus } from "@/lib/api/privacy";
import { usePrivacyExports, useRequestDeletion, useRequestExport } from "@/lib/queries/privacy";

const KIND_LABEL: Record<DataExportKind, string> = {
  FAMILY_DATA: "Family data",
  REPORT_ARCHIVE: "Report archive",
};

const STATUS_LABEL: Record<DataExportStatus, string> = {
  PENDING: "Preparing",
  GENERATING: "Preparing",
  READY: "Ready",
  FAILED: "Could not prepare",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function PrivacyDataScreen() {
  const exportsQuery = usePrivacyExports();
  const requestExport = useRequestExport();
  const requestDeletion = useRequestDeletion();

  const [isReviewingDeletion, setIsReviewingDeletion] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");

  const isExportPermissionDenied = requestExport.isError && isDeniedError(requestExport.error);
  const isExportOtherError = requestExport.isError && !isExportPermissionDenied;

  const isDeletionPermissionDenied = requestDeletion.isError && isDeniedError(requestDeletion.error);
  const isDeletionOtherError = requestDeletion.isError && !isDeletionPermissionDenied;

  const handleConfirmDeletion = () => {
    requestDeletion.mutate(deletionReason.trim() || undefined, {
      onSuccess: () => {
        setIsReviewingDeletion(false);
        setDeletionReason("");
      },
    });
  };

  if (exportsQuery.isError) {
    const isLoadDenied = isDeniedError(exportsQuery.error);
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Privacy" title="Could not load privacy & data" />
          {isLoadDenied ? (
            <NoticeCard
              title="You can't view privacy & data"
              body="Only admins and linked parents can view this."
              tone="danger"
            />
          ) : (
            <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (exportsQuery.isLoading || !exportsQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Privacy" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  const exportItems: ListCardItem[] = exportsQuery.data.map((request: DataExportRequest) => ({
    title: KIND_LABEL[request.kind],
    detail: formatDate(request.createdAt),
    meta: STATUS_LABEL[request.status],
  }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · Privacy"
          title="Your data, clearly controlled"
          description="Export, retention and deletion are understandable and separated."
        />

        <ContentCard
          title="Family data"
          body="Children, learning logs, preferences and evidence references."
          action={requestExport.isPending ? "Preparing..." : "Prepare family data"}
          tone="mint"
          onPress={!requestExport.isPending ? () => requestExport.mutate("FAMILY_DATA") : undefined}
        />

        <ContentCard
          title="Report archive"
          body="Report history, learning logs and evidence references."
          action={requestExport.isPending ? "Preparing..." : "Prepare report archive"}
          tone="mint"
          onPress={!requestExport.isPending ? () => requestExport.mutate("REPORT_ARCHIVE") : undefined}
        />

        <NoticeCard
          title="How to receive a prepared export"
          body="Once an export shows Ready below, contact support to receive a copy - in-app download isn't available yet."
        />

        {isExportPermissionDenied ? (
          <NoticeCard
            title="You can't prepare exports"
            body="Only admins and linked parents can export household data."
            tone="danger"
          />
        ) : isExportOtherError ? (
          <NoticeCard title="Could not prepare this export" body="Check your connection and try again." tone="danger" />
        ) : null}

        {exportItems.length === 0 ? (
          <NoticeCard title="No exports yet" body="Prepared exports will appear here." />
        ) : (
          <ListCard title="Past exports" items={exportItems} />
        )}

        <NoticeCard
          title="Community profile"
          body="Each adult manages their own Community profile and connections separately from household data."
        />

        {isReviewingDeletion ? (
          <>
            <NoticeCard
              title="What happens if you delete this family account"
              body="This sends a request to our support team - nothing is deleted immediately. Once actioned, children's profiles, learning records, invited adults and this Community profile are permanently removed. Export your data first if you want to keep it."
              tone="danger"
            />
            <FieldInput
              fields={[
                {
                  key: "reason",
                  label: "Reason (optional)",
                  value: deletionReason,
                  onChangeText: setDeletionReason,
                  placeholder: "Tell us why you're leaving",
                },
              ]}
            />
            <ScreenActions
              primaryLabel={requestDeletion.isPending ? "Sending request..." : "Submit deletion request"}
              onPrimaryPress={!requestDeletion.isPending ? handleConfirmDeletion : undefined}
              secondaryLabel="Cancel"
              onSecondaryPress={() => {
                setIsReviewingDeletion(false);
                setDeletionReason("");
              }}
            />
          </>
        ) : (
          <ContentCard
            title="Delete family account"
            body="Files a request with our support team to close this household."
            action="Review"
            tone="danger"
            onPress={() => setIsReviewingDeletion(true)}
          />
        )}

        {isDeletionPermissionDenied ? (
          <NoticeCard
            title="You can't request account deletion"
            body="Only admins and linked parents can request this."
            tone="danger"
          />
        ) : isDeletionOtherError ? (
          <NoticeCard title="Could not send this request" body="Check your connection and try again." tone="danger" />
        ) : requestDeletion.isSuccess && !isReviewingDeletion ? (
          <NoticeCard
            title="Request received"
            body="Our support team will review this and follow up by email."
            tone="mint"
          />
        ) : null}
      </ScrollView>
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
});
