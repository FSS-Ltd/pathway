import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState, type ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, SectionTitle, StandardButton } from "@/components/primitives/ui";
import { fetchAttendanceSessionDetail, type AttendanceSessionDetail } from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";
import { fetchSessionDetail, type SessionDetail } from "@/lib/api/sessions";
import { mobileTokens } from "@/design/tokens";

type UiAttendanceStatus = "present" | "late" | "absent" | "unmarked";

export default function ServeAttendanceSessionScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [attendanceDetail, setAttendanceDetail] = useState<AttendanceSessionDetail | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [initialStatusByChild, setInitialStatusByChild] = useState<Record<string, UiAttendanceStatus>>({});
  const [draftStatusByChild, setDraftStatusByChild] = useState<Record<string, UiAttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setError("Missing session id.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const [attendance, session] = await Promise.all([
        fetchAttendanceSessionDetail(sessionId),
        fetchSessionDetail(sessionId).catch(() => null),
      ]);
      setAttendanceDetail(attendance);
      setSessionDetail(session);
      const mapped = Object.fromEntries(
        attendance.childStatusRows.map((row) => [row.childId, mapApiStatusToUi(row.status)]),
      );
      setInitialStatusByChild(mapped);
      setDraftStatusByChild(mapped);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 404) {
        setIsNotFound(true);
      } else if (loadError instanceof ApiError && loadError.status === 403) {
        setError("You do not have permission to access this Serve attendance session.");
      } else {
        setError("Unable to load session detail.");
      }
      setAttendanceDetail(null);
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

  const registerRows = useMemo(
    () => attendanceDetail?.childStatusRows ?? [],
    [attendanceDetail],
  );

  const registerTitle = attendanceDetail?.session.title ?? sessionDetail?.title ?? "Session";
  const roomLabel = sessionDetail?.groups?.[0]?.name ?? attendanceDetail?.session.ageGroupLabel ?? "Room TBC";

  const summary = useMemo(() => {
    const base = { present: 0, late: 0, absent: 0, unmarked: 0 };
    registerRows.forEach((row) => {
      const status = draftStatusByChild[row.childId] ?? "unmarked";
      base[status] += 1;
    });
    return base;
  }, [registerRows, draftStatusByChild]);

  const hasUnsyncedChanges = useMemo(
    () =>
      registerRows.some(
        (row) => (initialStatusByChild[row.childId] ?? "unmarked") !== (draftStatusByChild[row.childId] ?? "unmarked"),
      ),
    [registerRows, initialStatusByChild, draftStatusByChild],
  );

  const markAllPresent = useCallback(() => {
    if (registerRows.length === 0) return;
    setDraftStatusByChild((prev) => {
      const next = { ...prev };
      registerRows.forEach((row) => {
        next[row.childId] = "present";
      });
      return next;
    });
  }, [registerRows]);

  const resetToServer = useCallback(() => {
    setDraftStatusByChild(initialStatusByChild);
  }, [initialStatusByChild]);

  return (
    <Screen tone="serve">
      <View style={styles.headerRow}>
        <StandardButton
          label="Back"
          variant="white"
          tone="serve"
          size="small"
          onPress={() => router.push("/(serve)/(tabs)/attendance")}
          iconLeft={<Ionicons name="arrow-back" size={18} color={mobileTokens.colors.text.primary} />}
          style={styles.backButtonControl}
        />
        <View style={styles.headerMeta}>
          <Text style={styles.sessionTitle}>{registerTitle}</Text>
          <View style={styles.iconLine}>
            <Ionicons name="time-outline" size={18} color={mobileTokens.colors.text.muted} />
            <Text style={styles.iconLineText}>
              {formatSessionDateTime(
                attendanceDetail?.session.startsAt ?? sessionDetail?.startsAt,
                attendanceDetail?.session.endsAt ?? sessionDetail?.endsAt,
              )}
            </Text>
          </View>
          <View style={styles.iconLine}>
            <Ionicons name="location-outline" size={18} color={mobileTokens.colors.text.muted} />
            <Text style={styles.iconLineText}>{roomLabel}</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <BrandedCard>
          <Text style={styles.stateText}>Loading session detail...</Text>
        </BrandedCard>
      ) : isNotFound ? (
        <BrandedCard>
          <SectionTitle title="Session not found" />
          <Text style={styles.stateText}>This session could not be located for the active site.</Text>
          <StandardButton
            label="Back to attendance list"
            tone="serve"
            variant="white"
            size="medium"
            onPress={() => router.push("/(serve)/(tabs)/attendance")}
          />
        </BrandedCard>
      ) : error ? (
        <BrandedCard>
          <SectionTitle title="Unable to load register" />
          <Text style={styles.stateText}>{error}</Text>
          <StandardButton label="Retry" tone="serve" variant="white" size="medium" onPress={() => void loadSession()} />
        </BrandedCard>
      ) : attendanceDetail ? (
        <>
          <BrandedCard style={styles.overviewCard}>
            <SectionTitle title="Attendance Overview" />
            <View style={styles.overviewGrid}>
              <View style={styles.overviewRow}>
                <OverviewTile label="Present" value={summary.present} tone="present" />
                <OverviewTile label="Late" value={summary.late} tone="late" />
              </View>
              <View style={styles.overviewRow}>
                <OverviewTile label="Absent" value={summary.absent} tone="absent" />
                <OverviewTile label="Not Marked" value={summary.unmarked} tone="unmarked" />
              </View>
            </View>
          </BrandedCard>

          <BrandedCard style={styles.rosterCard}>
            <SectionTitle title={`Children Roster (${registerRows.length})`} />
            {registerRows.length === 0 ? (
              <Text style={styles.stateText}>No participants found for this session.</Text>
            ) : (
              registerRows.map((row) => (
                <View
                  key={row.childId}
                  style={styles.childCard}
                >
                  <View style={styles.childHeaderRow}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person-outline" size={26} color={mobileTokens.colors.text.subtle} />
                    </View>
                    <View style={styles.childInfo}>
                      <Text style={styles.childName}>{row.childName}</Text>
                      <Text style={styles.childMeta}>Age not provided</Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Ionicons
                        name={statusIcon(draftStatusByChild[row.childId] ?? "unmarked")}
                        size={14}
                        color={statusColor(draftStatusByChild[row.childId] ?? "unmarked")}
                      />
                      <Text style={[styles.statusPillText, { color: statusColor(draftStatusByChild[row.childId] ?? "unmarked") }]}>
                        {registerStatusLabel(draftStatusByChild[row.childId] ?? "unmarked")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    {(["present", "late", "absent"] as const).map((option) => {
                      const selected = (draftStatusByChild[row.childId] ?? "unmarked") === option;
                      return (
                        <StandardButton
                          key={option}
                          label={registerStatusLabel(option)}
                          tone="serve"
                          variant="white"
                          size="small"
                          iconLeft={
                            <Ionicons
                              name={statusIcon(option)}
                              size={18}
                              color={mobileTokens.colors.text.primary}
                            />
                          }
                          style={selected ? [styles.actionButton, styles.actionButtonSelected] : styles.actionButton}
                          textStyle={styles.actionButtonText}
                          onPress={() =>
                            setDraftStatusByChild((prev) => ({
                              ...prev,
                              [row.childId]: option,
                            }))
                          }
                        />
                      );
                    })}
                    <StandardButton
                      label="Unmark"
                      tone="serve"
                      variant="white"
                      size="small"
                      iconLeft={<Ionicons name="close-circle-outline" size={18} color={mobileTokens.colors.text.primary} />}
                      style={(draftStatusByChild[row.childId] ?? "unmarked") === "unmarked"
                        ? [styles.actionButton, styles.actionButtonSelected]
                        : styles.actionButton}
                      textStyle={styles.actionButtonText}
                      onPress={() =>
                        setDraftStatusByChild((prev) => ({
                          ...prev,
                          [row.childId]: "unmarked",
                        }))
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </BrandedCard>

          <BrandedCard>
            <SectionTitle
              title="Register actions"
              subtitle="Prepared for mark-all, per-child updates, and offline queue in the next branch."
            />
            <View style={styles.unsyncedWrap}>
              <View style={[styles.syncDot, hasUnsyncedChanges ? styles.syncDotUnsynced : styles.syncDotSynced]} />
              <Text style={styles.unsyncedText}>
                {hasUnsyncedChanges ? "Unsynced register changes" : "No pending register changes"}
              </Text>
            </View>
            <View style={styles.registerActionRow}>
              <StandardButton
                label="Mark all present"
                tone="serve"
                variant="primary"
                size="medium"
                onPress={markAllPresent}
                style={styles.registerActionButton}
              />
              <StandardButton
                label="Reset"
                tone="serve"
                variant="white"
                size="medium"
                onPress={resetToServer}
                style={styles.registerActionButton}
              />
            </View>
            <StandardButton
              label="Save register (coming soon)"
              tone="serve"
              variant="disabled"
              size="medium"
              disabled
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

function formatSessionDateTime(startsAt?: string, endsAt?: string): string {
  if (!startsAt || !endsAt) return "Time TBC";
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time TBC";
  }

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startLabel = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endLabel = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dateLabel} • ${startLabel}-${endLabel}`;
}

function mapApiStatusToUi(status: AttendanceSessionDetail["childStatusRows"][number]["status"]): UiAttendanceStatus {
  if (status === "present") return "present";
  if (status === "absent") return "absent";
  return "unmarked";
}

function registerStatusLabel(status: UiAttendanceStatus): string {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  if (status === "absent") return "Absent";
  return "Not Marked";
}

function statusIcon(status: UiAttendanceStatus): ComponentProps<typeof Ionicons>["name"] {
  if (status === "present") return "checkmark-circle-outline";
  if (status === "late") return "time-outline";
  if (status === "absent") return "close-outline";
  return "alert-circle-outline";
}

function statusColor(status: UiAttendanceStatus): string {
  if (status === "present") return "#2fae9a";
  if (status === "late") return "#d39a22";
  if (status === "absent") return "#c53b51";
  return mobileTokens.colors.text.subtle;
}

function OverviewTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "present" | "late" | "absent" | "unmarked";
}) {
  const backgroundMap = {
    present: "#eaf6f3",
    late: "#f9f4e6",
    absent: "#faecef",
    unmarked: "#f1f2f3",
  } as const;
  const valueColorMap = {
    present: "#36b9a4",
    late: "#d4a126",
    absent: "#c52644",
    unmarked: mobileTokens.colors.text.subtle,
  } as const;

  return (
    <View
      style={[
        styles.overviewTile,
        { backgroundColor: backgroundMap[tone] },
      ]}
    >
      <Text style={[styles.overviewValue, { color: valueColorMap[tone] }]}>
        {value}
      </Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.sm,
    alignItems: "flex-start",
  },
  backButtonControl: {
    minWidth: 96,
    paddingHorizontal: mobileTokens.spacing.sm,
  },
  headerMeta: {
    flex: 1,
    gap: mobileTokens.spacing.xxs,
  },
  sessionTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.lg.size,
    lineHeight: mobileTokens.typography.heading.lg.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  iconLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.xs,
  },
  iconLineText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    color: mobileTokens.colors.text.muted,
    fontSize: mobileTokens.typography.body.lg.size,
  },
  unsyncedWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.xs,
    marginTop: mobileTokens.spacing.xxs,
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  syncDotUnsynced: {
    backgroundColor: "#e8b746",
  },
  syncDotSynced: {
    backgroundColor: "#36b9a4",
  },
  unsyncedText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.primary,
  },
  overviewCard: {
    marginTop: mobileTokens.spacing.sm,
    padding: mobileTokens.spacing.md,
  },
  rosterCard: {
    marginTop: mobileTokens.spacing.xs,
    padding: mobileTokens.spacing.md,
  },
  overviewGrid: {
    gap: mobileTokens.spacing.sm,
  },
  overviewRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.sm,
  },
  overviewTile: {
    flex: 1,
    borderRadius: mobileTokens.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: mobileTokens.spacing.xs,
    minHeight: 120,
    paddingVertical: mobileTokens.spacing.md,
  },
  overviewValue: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.md.size,
  },
  overviewLabel: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.muted,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  childCard: {
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.md,
    gap: mobileTokens.spacing.sm,
  },
  childHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.sm,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTokens.colors.bg.surface,
  },
  childInfo: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  childName: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  childMeta: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.text.subtle,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileTokens.spacing.xxxs,
    borderRadius: mobileTokens.radius.round,
    backgroundColor: mobileTokens.colors.bg.muted,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xxs,
  },
  statusPillText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.xs,
    flexWrap: "wrap",
  },
  actionButton: {
    width: "48%",
    flexGrow: 0,
    flexShrink: 0,
    borderColor: mobileTokens.colors.accent.primary,
  },
  actionButtonSelected: {
    backgroundColor: mobileTokens.colors.accent.subtle,
    borderColor: mobileTokens.colors.accent.primary,
  },
  actionButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.semibold,
    textAlign: "center",
    flexShrink: 1,
  },
  registerActionRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
    marginTop: mobileTokens.spacing.xs,
  },
  registerActionButton: {
    flex: 1,
  },
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
