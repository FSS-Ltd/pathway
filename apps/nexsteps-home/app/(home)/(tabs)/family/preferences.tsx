import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { ApiError } from "@/lib/api";
import type { PlanningPreferences } from "@/lib/api/preferences";
import { usePlanningPreferences, useUpdatePlanningPreferences } from "@/lib/queries/preferences";

const WEEK_STARTS_ON_OPTIONS: { label: string; value: PlanningPreferences["weekStartsOn"] }[] = [
  { label: "Monday", value: "Mon" },
  { label: "Sunday", value: "Sun" },
];

const TIME_FORMAT_OPTIONS: { label: string; value: PlanningPreferences["timeFormat"] }[] = [
  { label: "24 hour", value: "24h" },
  { label: "12 hour", value: "12h" },
];

const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: "English (UK)", value: "en-GB" },
  { label: "English (US)", value: "en-US" },
];

export default function PreferencesScreen() {
  const preferencesQuery = usePlanningPreferences();
  const updatePreferences = useUpdatePlanningPreferences();

  const [weekStartsOnIndex, setWeekStartsOnIndex] = useState(0);
  const [timeFormatIndex, setTimeFormatIndex] = useState(0);
  const [languageIndex, setLanguageIndex] = useState(0);
  const [durationText, setDurationText] = useState("");
  const [dailyLimitText, setDailyLimitText] = useState("");

  // Hydrate local edit state from the fetched preferences once, not on
  // every refetch - matches child-details.tsx's guard against a
  // background refetch silently overwriting unsaved edits (the app's
  // QueryClient default staleTime is 0).
  const hydrated = useRef(false);

  useEffect(() => {
    if (preferencesQuery.data && !hydrated.current) {
      hydrated.current = true;
      const data = preferencesQuery.data;
      setWeekStartsOnIndex(WEEK_STARTS_ON_OPTIONS.findIndex((o) => o.value === data.weekStartsOn));
      setTimeFormatIndex(TIME_FORMAT_OPTIONS.findIndex((o) => o.value === data.timeFormat));
      const languageMatch = LANGUAGE_OPTIONS.findIndex((o) => o.value === data.language);
      setLanguageIndex(languageMatch === -1 ? 0 : languageMatch);
      setDurationText(String(data.defaultActivityDurationMinutes));
      setDailyLimitText(String(data.dailyPlanningLimit));
    }
  }, [preferencesQuery.data]);

  const isPermissionDenied =
    updatePreferences.isError &&
    updatePreferences.error instanceof ApiError &&
    updatePreferences.error.status === 403;

  const handleSave = () => {
    updatePreferences.mutate({
      weekStartsOn: WEEK_STARTS_ON_OPTIONS[weekStartsOnIndex].value,
      timeFormat: TIME_FORMAT_OPTIONS[timeFormatIndex].value,
      language: LANGUAGE_OPTIONS[languageIndex].value,
      defaultActivityDurationMinutes: Number(durationText),
      dailyPlanningLimit: Number(dailyLimitText),
    });
  };

  if (preferencesQuery.isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Preferences" title="Could not load preferences" />
          <NoticeCard title="Something went wrong" body="Check your connection and try again." tone="danger" />
        </View>
      </SafeAreaView>
    );
  }

  if (preferencesQuery.isLoading || !preferencesQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ScreenHeader eyebrow="Family · Preferences" title="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Family · Preferences"
          title="Planning preferences"
          description="Shape the app around your family rhythm."
        />

        <ChipRow
          label="Week starts"
          items={WEEK_STARTS_ON_OPTIONS.map((o) => o.label)}
          active={WEEK_STARTS_ON_OPTIONS.map((_, index) => index === weekStartsOnIndex)}
          onPress={setWeekStartsOnIndex}
        />

        <FieldInput
          fields={[
            {
              key: "defaultActivityDurationMinutes",
              label: "Default activity duration (minutes)",
              value: durationText,
              onChangeText: setDurationText,
              keyboardType: "numeric",
            },
            {
              key: "dailyPlanningLimit",
              label: "Daily planning limit (activities per child)",
              value: dailyLimitText,
              onChangeText: setDailyLimitText,
              keyboardType: "numeric",
            },
          ]}
        />

        <ChipRow
          label="Time format"
          items={TIME_FORMAT_OPTIONS.map((o) => o.label)}
          active={TIME_FORMAT_OPTIONS.map((_, index) => index === timeFormatIndex)}
          onPress={setTimeFormatIndex}
        />

        <ChipRow
          label="Language"
          items={LANGUAGE_OPTIONS.map((o) => o.label)}
          active={LANGUAGE_OPTIONS.map((_, index) => index === languageIndex)}
          onPress={setLanguageIndex}
        />

        <NoticeCard
          title="Calm defaults"
          body="The app avoids streaks, rankings and pressure-based reminders."
        />

        {isPermissionDenied ? (
          <NoticeCard
            title="You can't edit preferences"
            body="Only admins and linked parents can make changes."
            tone="danger"
          />
        ) : updatePreferences.isError ? (
          <NoticeCard title="Could not save preferences" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={updatePreferences.isPending ? "Saving..." : "Save preferences"}
          onPrimaryPress={!updatePreferences.isPending ? handleSave : undefined}
          secondaryLabel="Notifications"
          onSecondaryPress={() => router.push("/(home)/(tabs)/family/notifications")}
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
