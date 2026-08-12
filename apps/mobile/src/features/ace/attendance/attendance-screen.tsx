import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Screen } from "@/components/primitives/screen";
import {
  BrandedCard,
  SectionTitle,
  StandardButton,
} from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import {
  fetchAttendanceSessionDetail,
  saveAttendanceSession,
  AttendanceSaveError,
  type AttendanceRegisterStatus,
  type AttendanceSessionDetail,
  type SaveAttendanceRow,
} from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";
import { fetchSessionDetail, type SessionDetail } from "@/lib/api/sessions";
import { AttendanceRegisterRow } from "./attendance-register-row";
import { styles } from "./attendance-screen.styles";

type MarkedStatus = Exclude<AttendanceRegisterStatus, "unknown">;

export function AttendanceScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [detail, setDetail] = useState<AttendanceSessionDetail | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(
    null,
  );
  const [draftStatus, setDraftStatus] = useState<
    Record<string, AttendanceRegisterStatus>
  >({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const submissionGate = useRef(false);
  const uncertainRowsRef = useRef<SaveAttendanceRow[] | null>(null);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setLoadError("Missing session id.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setIsNotFound(false);
    try {
      const [attendance, supplementary] = await Promise.all([
        fetchAttendanceSessionDetail(sessionId),
        fetchSessionDetail(sessionId).catch(() => null),
      ]);
      setDetail(attendance);
      setSessionDetail(supplementary);
      setDraftStatus(statusMap(attendance));
      setReasons({});
      setValidation({});
      setSaveError(null);
      setSaveSuccess(null);
      setNeedsReconciliation(false);
      uncertainRowsRef.current = null;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setIsNotFound(true);
      } else if (cause instanceof ApiError && cause.status === 403) {
        setLoadError(
          "You do not have permission to access this Serve attendance session.",
        );
      } else {
        setLoadError("Unable to load session detail.");
      }
      setDetail(null);
      setSessionDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      void loadSession();
    }, [loadSession]),
  );

  const rows = detail?.childStatusRows ?? [];
  const changes = useMemo(
    () =>
      rows.flatMap((row) => {
        const selected = draftStatus[row.childId] ?? row.status;
        return selected !== "unknown" && selected !== row.status
          ? [{ row, selected }]
          : [];
      }),
    [draftStatus, rows],
  );

  const selectStatus = useCallback((childId: string, status: MarkedStatus) => {
    setDraftStatus((current) => ({ ...current, [childId]: status }));
    setValidation((current) => ({ ...current, [childId]: "" }));
    setSaveError(null);
    setSaveSuccess(null);
  }, []);

  const reconcileUnknownOutcome = useCallback(
    async (payload: SaveAttendanceRow[]) => {
      if (!sessionId) return;
      try {
        const updated = await fetchAttendanceSessionDetail(sessionId);
        setDetail(updated);
        if (hasAppliedRows(updated, payload)) {
          setDraftStatus(statusMap(updated));
          setReasons({});
          setValidation({});
          setSaveError(null);
          setSaveSuccess(
            "Attendance was confirmed after refreshing the server register.",
          );
        } else {
          setSaveError(
            "The save response was interrupted. The latest server register was loaded and your pending choices were preserved. Review them before retrying.",
          );
        }
        uncertainRowsRef.current = null;
        setNeedsReconciliation(false);
      } catch {
        uncertainRowsRef.current = payload;
        setNeedsReconciliation(true);
        setSaveError(
          "The save response was interrupted, so the outcome is unknown. Check the server register before retrying.",
        );
      }
    },
    [sessionId],
  );

  const save = useCallback(async () => {
    if (!sessionId || submissionGate.current || changes.length === 0) return;

    const nextValidation: Record<string, string> = {};
    const payload = changes.map<SaveAttendanceRow>(({ row, selected }) => {
      const correctionReason = reasons[row.childId]?.trim();
      if (row.attendanceId && !correctionReason) {
        nextValidation[row.childId] = "Enter a correction reason.";
      }
      return {
        childId: row.childId,
        status: toApiStatus(selected),
        ...(row.attendanceId && correctionReason ? { correctionReason } : {}),
      };
    });
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) return;

    submissionGate.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const updated = await saveAttendanceSession(sessionId, payload);
      setDetail(updated);
      setDraftStatus(statusMap(updated));
      setReasons({});
      setValidation({});
      setNeedsReconciliation(false);
      uncertainRowsRef.current = null;
      setSaveSuccess("Attendance saved from the server response.");
    } catch (cause) {
      if (
        cause instanceof AttendanceSaveError &&
        cause.outcome === "rejected"
      ) {
        setSaveError(
          "No attendance changes were saved. Check the register and retry.",
        );
      } else {
        await reconcileUnknownOutcome(payload);
      }
    } finally {
      submissionGate.current = false;
      setIsSaving(false);
    }
  }, [changes, reasons, reconcileUnknownOutcome, sessionId]);

  const checkServerStatus = useCallback(async () => {
    const payload = uncertainRowsRef.current;
    if (!payload || submissionGate.current) return;
    submissionGate.current = true;
    setIsSaving(true);
    await reconcileUnknownOutcome(payload);
    submissionGate.current = false;
    setIsSaving(false);
  }, [reconcileUnknownOutcome]);

  const markAllPresent = useCallback(() => {
    setDraftStatus((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        next[row.childId] = "present";
      });
      return next;
    });
    setSaveError(null);
    setSaveSuccess(null);
  }, [rows]);

  const reset = useCallback(() => {
    if (!detail) return;
    setDraftStatus(statusMap(detail));
    setReasons({});
    setValidation({});
    setSaveError(null);
    setSaveSuccess(null);
  }, [detail]);

  const title = detail?.session.title ?? sessionDetail?.title ?? "Session";
  const room =
    sessionDetail?.groups?.[0]?.name ??
    detail?.session.ageGroupLabel ??
    "Room TBC";

  return (
    <Screen tone="serve">
      <View style={styles.headerRow}>
        <StandardButton
          iconLeft={
            <Ionicons
              color={mobileTokens.colors.text.primary}
              name="arrow-back"
              size={18}
            />
          }
          label="Back"
          onPress={() => router.push("/(serve)/(tabs)/attendance")}
          size="small"
          style={styles.backButton}
          tone="serve"
          variant="white"
        />
        <View style={styles.headerMeta}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.metaText}>
            {formatSessionDateTime(
              detail?.session.startsAt ?? sessionDetail?.startsAt,
              detail?.session.endsAt ?? sessionDetail?.endsAt,
            )}
          </Text>
          <Text style={styles.metaText}>{room}</Text>
        </View>
      </View>

      {isLoading ? (
        <BrandedCard>
          <Text style={styles.stateText}>Loading session detail...</Text>
        </BrandedCard>
      ) : isNotFound ? (
        <BrandedCard>
          <SectionTitle title="Session not found" />
          <Text style={styles.stateText}>
            This session could not be located for the active site.
          </Text>
          <StandardButton
            label="Back to attendance list"
            onPress={() => router.push("/(serve)/(tabs)/attendance")}
            size="medium"
            tone="serve"
            variant="white"
          />
        </BrandedCard>
      ) : loadError ? (
        <BrandedCard>
          <SectionTitle title="Unable to load register" />
          <Text accessibilityRole="alert" style={styles.stateText}>
            {loadError}
          </Text>
          <StandardButton
            label="Retry"
            onPress={() => void loadSession()}
            size="medium"
            tone="serve"
            variant="white"
          />
        </BrandedCard>
      ) : detail ? (
        <>
          <BrandedCard style={styles.sectionCard}>
            <SectionTitle
              subtitle="Counts update only after the server confirms the register."
              title="Saved attendance summary"
            />
            <View style={styles.summaryGrid}>
              <View style={styles.summaryRow}>
                <SummaryTile label="Present" value={detail.summary.present} />
                <SummaryTile label="Late" value={detail.summary.late} />
              </View>
              <View style={styles.summaryRow}>
                <SummaryTile label="Absent" value={detail.summary.absent} />
                <SummaryTile
                  label="Not marked"
                  value={detail.summary.unknown}
                />
              </View>
            </View>
          </BrandedCard>

          <BrandedCard style={styles.sectionCard}>
            <SectionTitle title={`Children roster (${rows.length})`} />
            {rows.length === 0 ? (
              <Text style={styles.stateText}>
                No participants found for this session.
              </Text>
            ) : (
              rows.map((row) => {
                const selected = draftStatus[row.childId] ?? row.status;
                const requiresReason = Boolean(
                  row.attendanceId &&
                  selected !== "unknown" &&
                  selected !== row.status,
                );
                return (
                  <AttendanceRegisterRow
                    childName={row.childName}
                    correctionError={validation[row.childId]}
                    correctionReason={reasons[row.childId] ?? ""}
                    disabled={isSaving || needsReconciliation}
                    key={row.childId}
                    onChangeCorrectionReason={(value) => {
                      setReasons((current) => ({
                        ...current,
                        [row.childId]: value,
                      }));
                      setValidation((current) => ({
                        ...current,
                        [row.childId]: "",
                      }));
                      setSaveError(null);
                    }}
                    onSelect={(status) => selectStatus(row.childId, status)}
                    requiresCorrectionReason={requiresReason}
                    savedStatus={row.status}
                    selectedStatus={selected}
                  />
                );
              })
            )}
          </BrandedCard>

          <BrandedCard style={styles.sectionCard}>
            <SectionTitle
              subtitle="Pending choices are not shown as saved until the returned register confirms them."
              title="Register actions"
            />
            <Text style={styles.pendingSummary}>
              {changes.length === 0
                ? "No pending register changes"
                : `${changes.length} pending ${changes.length === 1 ? "change" : "changes"}`}
            </Text>
            {saveError ? (
              <View
                accessibilityLiveRegion="assertive"
                style={styles.errorCallout}
              >
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {saveError}
                </Text>
                <StandardButton
                  disabled={isSaving}
                  label={
                    needsReconciliation ? "Check server status" : "Retry save"
                  }
                  onPress={() =>
                    void (needsReconciliation ? checkServerStatus() : save())
                  }
                  size="medium"
                  tone="serve"
                  variant="white"
                />
              </View>
            ) : null}
            {saveSuccess ? (
              <Text accessibilityLiveRegion="polite" style={styles.successText}>
                {saveSuccess}
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              <StandardButton
                disabled={isSaving || needsReconciliation || rows.length === 0}
                label="Mark all present"
                multiline
                onPress={markAllPresent}
                size="medium"
                style={styles.actionButton}
                tone="serve"
                variant="primary"
              />
              <StandardButton
                disabled={
                  isSaving || needsReconciliation || changes.length === 0
                }
                label="Reset changes"
                multiline
                onPress={reset}
                size="medium"
                style={styles.actionButton}
                tone="serve"
                variant="white"
              />
            </View>
            <StandardButton
              disabled={isSaving || needsReconciliation || changes.length === 0}
              label={isSaving ? "Saving register…" : "Save register"}
              multiline
              onPress={() => void save()}
              size="medium"
              tone="serve"
              variant="primary"
            />
          </BrandedCard>
        </>
      ) : (
        <BrandedCard>
          <Text style={styles.stateText}>No attendance detail available.</Text>
        </BrandedCard>
      )}
    </Screen>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <View
      accessibilityLabel={`${value} saved ${label.toLowerCase()}`}
      style={styles.summaryTile}
    >
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label} saved</Text>
    </View>
  );
}

function statusMap(detail: AttendanceSessionDetail) {
  return Object.fromEntries(
    detail.childStatusRows.map((row) => [row.childId, row.status]),
  );
}

function toApiStatus(status: MarkedStatus): SaveAttendanceRow["status"] {
  if (status === "present") return "PRESENT";
  if (status === "absent") return "ABSENT";
  return "LATE";
}

function hasAppliedRows(
  detail: AttendanceSessionDetail,
  rows: SaveAttendanceRow[],
): boolean {
  const statuses = new Map(
    detail.childStatusRows.map((row) => [
      row.childId,
      row.status === "unknown" ? null : toApiStatus(row.status),
    ]),
  );
  return rows.every((row) => statuses.get(row.childId) === row.status);
}

function formatSessionDateTime(startsAt?: string, endsAt?: string): string {
  if (!startsAt || !endsAt) return "Time TBC";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time TBC";
  }
  return `${start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} • ${start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}-${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
