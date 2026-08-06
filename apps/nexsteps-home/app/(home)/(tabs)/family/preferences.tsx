import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { ApiError, isDeniedError } from "@/lib/api";
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
  // -1 means "no chip matches the stored value" (a language outside the two
  // shown options - the DTO only constrains this to a 2-10 char string, not
  // a true enum, unlike weekStartsOn/timeFormat). Left un-highlighted
  // rather than defaulted to index 0, and excluded from the save payload
  // unless the user actually picks a chip - see languageTouched below.
  const [languageIndex, setLanguageIndex] = useState(-1);
  const [languageTouched, setLanguageTouched] = useState(false);
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
      setLanguageIndex(LANGUAGE_OPTIONS.findIndex((o) => o.value === data.language));
      setDurationText(String(data.defaultActivityDurationMinutes));
      setDailyLimitText(String(data.dailyPlanningLimit));
    }
  }, [preferencesQuery.data]);

  const isPermissionDenied = updatePreferences.isError && isDeniedError(updatePreferences.error);
  const isValidationError =
    updatePreferences.isError &&
    updatePreferences.error instanceof ApiError &&
    updatePreferences.error.status === 400;

  const duration = Number(durationText);
  const dailyLimit = Number(dailyLimitText);
  // Mirrors the Zod bounds in planningPreferencesSchema (defaultActivityDurationMinutes:
  // int 5-240, dailyPlanningLimit: int 1-10) - matches every other screen in this app
  // (child-add.tsx, task-editor.tsx, ...) gating Save on a canSave check rather than
  // letting an invalid body reach the server and surface as a generic error.
  const canSave =
    Number.isInteger(duration) &&
    duration >= 5 &&
    duration <= 240 &&
    Number.isInteger(dailyLimit) &&
    dailyLimit >= 1 &&
    dailyLimit <= 10;

  const handleLanguagePress = (index: number) => {
    setLanguageIndex(index);
    setLanguageTouched(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    updatePreferences.mutate({
      weekStartsOn: WEEK_STARTS_ON_OPTIONS[weekStartsOnIndex].value,
      timeFormat: TIME_FORMAT_OPTIONS[timeFormatIndex].value,
      // Only send language if the user actually picked a chip this
      // session - an untouched, unrecognized stored value (outside the
      // two shown options) must pass through unmodified rather than being
      // silently overwritten with whatever chip index 0 happens to be.
      ...(languageTouched ? { language: LANGUAGE_OPTIONS[languageIndex].value } : {}),
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
          onPress={handleLanguagePress}
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
        ) : isValidationError ? (
          <NoticeCard
            title="Check your preferences"
            body="Default activity duration must be 5-240 minutes and daily planning limit 1-10 activities."
            tone="danger"
          />
        ) : updatePreferences.isError ? (
          <NoticeCard title="Could not save preferences" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={updatePreferences.isPending ? "Saving..." : "Save preferences"}
          onPrimaryPress={canSave && !updatePreferences.isPending ? handleSave : undefined}
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
