import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ContentCard, FieldInput, NoticeCard, ScreenActions, ScreenHeader, ToggleRow } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { ApiError } from "@/lib/api";
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@/lib/queries/preferences";

export default function NotificationsScreen() {
  const preferencesQuery = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const [todaySummary, setTodaySummary] = useState(true);
  const [activityReminders, setActivityReminders] = useState(true);
  const [tasksDue, setTasksDue] = useState(true);
  const [communityHellos, setCommunityHellos] = useState(true);
  const [channelActivity, setChannelActivity] = useState(true);
  const [meetupsNearby, setMeetupsNearby] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState("");
  const [quietHoursEnd, setQuietHoursEnd] = useState("");

  // Hydrate local edit state from the fetched preferences once, not on
  // every refetch - matches child-details.tsx/preferences.tsx's guard
  // against a background refetch silently overwriting unsaved edits.
  const hydrated = useRef(false);

  useEffect(() => {
    if (preferencesQuery.data && !hydrated.current) {
      hydrated.current = true;
      const data = preferencesQuery.data;
      setTodaySummary(data.todaySummary);
      setActivityReminders(data.activityReminders);
      setTasksDue(data.tasksDue);
      setCommunityHellos(data.communityHellos);
      setChannelActivity(data.channelActivity);
      setMeetupsNearby(data.meetupsNearby);
      setQuietHoursEnabled(data.quietHours.enabled);
      setQuietHoursStart(data.quietHours.start);
      setQuietHoursEnd(data.quietHours.end);
    }
  }, [preferencesQuery.data]);

  const isPermissionDenied =
    updatePreferences.isError &&
    updatePreferences.error instanceof ApiError &&
    updatePreferences.error.status === 403;

  const handleSave = () => {
    updatePreferences.mutate({
      todaySummary,
      activityReminders,
      tasksDue,
      communityHellos,
      channelActivity,
      meetupsNearby,
      quietHours: { start: quietHoursStart, end: quietHoursEnd, enabled: quietHoursEnabled },
    });
  };

  if (preferencesQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Notifications" title="Could not load notifications" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (preferencesQuery.isLoading || !preferencesQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Notifications" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · Notifications"
          title="Useful, not noisy"
          description="Choose what deserves attention and when."
        />

        <ToggleRow
          label="Today summary"
          detail="08:00 on learning days"
          value={todaySummary}
          onValueChange={setTodaySummary}
        />
        <ToggleRow
          label="Activity reminders"
          detail="15 minutes before"
          value={activityReminders}
          onValueChange={setActivityReminders}
        />
        <ToggleRow label="Tasks due" detail="Same day" value={tasksDue} onValueChange={setTasksDue} />
        <ToggleRow
          label="Community hellos"
          detail="Immediately"
          value={communityHellos}
          onValueChange={setCommunityHellos}
        />
        <ToggleRow
          label="Channel activity"
          detail="Daily digest"
          value={channelActivity}
          onValueChange={setChannelActivity}
        />
        <ToggleRow
          label="Meetups nearby"
          detail="Weekly"
          value={meetupsNearby}
          onValueChange={setMeetupsNearby}
        />

        <ContentCard
          title="Quiet hours"
          body={`${quietHoursStart} – ${quietHoursEnd} · urgent account alerts only`}
          meta={quietHoursEnabled ? "Active" : "Off"}
        />
        <ToggleRow label="Quiet hours enabled" value={quietHoursEnabled} onValueChange={setQuietHoursEnabled} />
        <FieldInput
          fields={[
            { key: "quietHoursStart", label: "Starts", value: quietHoursStart, onChangeText: setQuietHoursStart },
            { key: "quietHoursEnd", label: "Ends", value: quietHoursEnd, onChangeText: setQuietHoursEnd },
          ]}
        />

        {isPermissionDenied ? (
          <NoticeCard
            title="You can't edit notifications"
            body="Only admins and linked parents can make changes."
            tone="danger"
          />
        ) : updatePreferences.isError ? (
          <NoticeCard title="Could not save notifications" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={updatePreferences.isPending ? "Saving..." : "Save notifications"}
          onPrimaryPress={!updatePreferences.isPending ? handleSave : undefined}
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
