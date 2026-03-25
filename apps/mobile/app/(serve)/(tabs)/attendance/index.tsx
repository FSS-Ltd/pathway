import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Screen } from "@/components/primitives/screen";
import { BrandedCard, Chip, ListRow, SectionTitle } from "@/components/primitives/ui";
import {
  fetchAttendanceSessionSummaries,
  type AttendanceSessionSummary,
  type AttendanceSessionProgress,
} from "@/lib/api/attendance";
import { apiClient, ApiError } from "@/lib/api/client";
import { fetchCurrentStaffProfile, type StaffProfile } from "@/lib/api/staff";
import { env } from "@/config/env";
import { mobileTokens } from "@/design/tokens";

export default function ServeAttendanceScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AttendanceSessionSummary[]>([]);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sessionResult, profileResult] = await Promise.allSettled([
        fetchAttendanceSessionSummaries({ daysAhead: 7 }),
        fetchCurrentStaffProfile(),
      ]);

      if (sessionResult.status === "fulfilled") {
        setSessions(sessionResult.value);
      } else {
        throw sessionResult.reason;
      }

      if (profileResult.status === "fulfilled") {
        setStaffProfile(profileResult.value);
      } else {
        setStaffProfile(null);
      }
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 403) {
        setError("You do not have access to Serve attendance for this site.");
      } else {
        setError("Unable to load attendance sessions right now.");
      }
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  const todaysSessions = useMemo(
    () =>
      sessions.filter((session) => isSameDay(session.startsAt, new Date())),
    [sessions],
  );

  const otherSessions = useMemo(
    () =>
      sessions.filter((session) => !isSameDay(session.startsAt, new Date())),
    [sessions],
  );

  const unsyncedSessionsCount: number = 0;
  const pickupNotificationsCount: number = 0;
  const greeting = getGreetingByTime(new Date());
  const firstName = getFirstName(staffProfile);
  const accessToken = apiClient.getAccessToken();
  const avatarSource = staffProfile?.hasAvatar
    ? accessToken
      ? {
          uri: `${env.apiUrl}/staff/profile/avatar`,
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      : { uri: `${env.apiUrl}/staff/profile/avatar` }
    : null;

  return (
    <Screen tone="serve">
      <BrandedCard>
        <View style={styles.opsHeader}>
          <View style={styles.opsTextWrap}>
            <Text style={styles.opsGreeting}>{`${greeting}, ${firstName}`}</Text>
            <Text style={styles.opsSummary}>
              You have {todaysSessions.length} session{todaysSessions.length === 1 ? "" : "s"} today
            </Text>
            <Text style={styles.opsSubtle}>
              {unsyncedSessionsCount} unsynced session{unsyncedSessionsCount === 1 ? "" : "s"}
            </Text>
          </View>
          {avatarSource ? (
            <Image source={avatarSource} style={styles.opsAvatarImage} />
          ) : (
            <View style={styles.opsAvatarCircle}>
              <Ionicons name="person-outline" size={24} color={mobileTokens.colors.bg.surface} />
            </View>
          )}
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="notifications-outline" size={16} color={mobileTokens.colors.accent.serve} />
          <Text style={styles.infoBannerText}>
            {pickupNotificationsCount} pickup notification{pickupNotificationsCount === 1 ? "" : "s"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={mobileTokens.colors.accent.serve} />
        </View>
        {error ? <Text style={styles.stateText}>{error}</Text> : null}
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Today's Sessions" subtitle="Operational cards for quick action." />
        {isLoading ? (
          <Text style={styles.stateText}>Loading sessions...</Text>
        ) : todaysSessions.length === 0 ? (
          <Text style={styles.stateText}>No sessions today.</Text>
        ) : (
          todaysSessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() => {
                router.push(`/(serve)/(tabs)/attendance/${session.sessionId}`);
              }}
              style={styles.todayCard}
            >
              <View style={styles.todayCardHeader}>
                <Text style={styles.todayCardTitle}>{session.title ?? "Session"}</Text>
                <View style={styles.todayCardTimeWrap}>
                  <Text style={styles.todayCardTime}>
                    {formatClockTime(session.startsAt)}
                  </Text>
                  <Text style={styles.todayCardTimeSub}>
                    to {formatClockTime(session.endsAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.kpiRow}>
                <Chip
                  label={timingLabel(session.timingStatus)}
                  tone="serve"
                  kind={session.timingStatus === "live" ? "solid" : "soft"}
                />
                <Chip label={progressLabel(session.status)} tone="serve" />
              </View>
              <Text style={styles.todayCardMeta}>
                {session.ageGroupLabel ?? "Group TBC"} • {session.markedCount}/{session.totalChildCount} marked
              </Text>
            </Pressable>
          ))
        )}
      </BrandedCard>

      <BrandedCard>
        <SectionTitle title="Session list" subtitle="Upcoming, live, and recently completed." />
        {isLoading ? (
          <Text style={styles.stateText}>Loading sessions...</Text>
        ) : sessions.length === 0 ? (
          <Text style={styles.stateText}>Nothing to show yet.</Text>
        ) : (
          otherSessions.map((session) => (
            <Pressable
              key={session.sessionId}
              onPress={() => {
                router.push(`/(serve)/(tabs)/attendance/${session.sessionId}`);
              }}
            >
              <ListRow
                title={session.title ?? "Session"}
                subtitle={`${formatSessionDateTime(session.startsAt, session.endsAt)}${session.ageGroupLabel ? ` • ${session.ageGroupLabel}` : ""}`}
                right={`${timingLabel(session.timingStatus)} • ${session.markedCount}/${session.totalChildCount}`}
              />
            </Pressable>
          ))
        )}
      </BrandedCard>
    </Screen>
  );
}

function getGreetingByTime(date: Date): string {
  const hour = date.getHours();
  if (hour < 4) return "Good night";
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFirstName(profile: StaffProfile | null): string {
  const explicitFirstName = profile?.firstName?.trim();
  if (explicitFirstName) return explicitFirstName;

  const fullNameCandidate = profile?.fullName?.trim() || profile?.displayName?.trim() || "";
  if (!fullNameCandidate) return "there";
  const firstToken = fullNameCandidate.split(/\s+/)[0];
  if (!firstToken) return "there";
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
}

function formatSessionDateTime(startsAt: string, endsAt: string): string {
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
  const fromLabel = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const toLabel = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dateLabel} ${fromLabel} - ${toLabel}`;
}

function formatClockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(value: string, day: Date): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function timingLabel(status: AttendanceSessionSummary["timingStatus"]): string {
  if (status === "live") return "Live";
  if (status === "completed") return "Completed";
  return "Upcoming";
}

function progressLabel(status: AttendanceSessionProgress): string {
  if (status === "in_progress") return "Register in progress";
  if (status === "complete") return "Register complete";
  return "Not started";
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    gap: mobileTokens.spacing.xs,
    flexWrap: "wrap",
  },
  stateBlock: {
    gap: mobileTokens.spacing.xs,
  },
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  opsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
  },
  opsTextWrap: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  opsGreeting: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.sm.size,
    lineHeight: mobileTokens.typography.heading.sm.lineHeight,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  opsSummary: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.lg.size,
    lineHeight: mobileTokens.typography.body.lg.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  opsSubtle: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.text.muted,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  opsAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTokens.colors.accent.serve,
  },
  opsAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: mobileTokens.colors.bg.muted,
  },
  infoBanner: {
    marginTop: mobileTokens.spacing.xs,
    minHeight: 46,
    borderRadius: mobileTokens.radius.md,
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    backgroundColor: mobileTokens.colors.accent.serveSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.xs,
  },
  infoBannerText: {
    flex: 1,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.semibold,
  },
  todayCard: {
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.xs,
  },
  todayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
  },
  todayCardTitle: {
    flex: 1,
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.heading.sm.size,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  todayCardTimeWrap: {
    alignItems: "flex-end",
  },
  todayCardTime: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.primary,
    fontWeight: mobileTokens.typography.weight.bold,
  },
  todayCardTimeSub: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.text.muted,
  },
  todayCardMeta: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.muted,
  },
});
