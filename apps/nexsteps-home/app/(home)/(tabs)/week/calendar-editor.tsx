import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { ChipRow, FieldInput, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import { combineDateAndTime, formatDayLabel, TIME_OPTIONS, upcomingDayOptions } from "@/lib/date-options";
import { useCreateCalendarItem } from "@/lib/queries/family-planner";

export default function CalendarEditorScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const days = useMemo(() => upcomingDayOptions(6, date ? new Date(date) : new Date()), [date]);

  const createCalendarItem = useCreateCalendarItem();

  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [location, setLocation] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number | null>(null);

  const canSave = title.trim().length > 0 && selectedTimeIndex !== null;

  const handleSave = () => {
    if (!canSave || selectedTimeIndex === null) return;
    const scheduledAt = combineDateAndTime(days[selectedDayIndex].date, TIME_OPTIONS[selectedTimeIndex]);
    createCalendarItem.mutate(
      {
        title: title.trim(),
        who: who.trim() || undefined,
        scheduledAt: scheduledAt.toISOString(),
        location: location.trim() || undefined,
      },
      { onSuccess: () => router.replace("/(home)/(tabs)/week") },
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Calendar item"
          title="Add an appointment"
          description="Family commitments sit alongside learning."
        />

        <FieldInput
          fields={[
            { key: "title", label: "Title", value: title, onChangeText: setTitle, placeholder: "Library visit" },
            { key: "who", label: "Who", value: who, onChangeText: setWho, placeholder: "Whole family" },
            {
              key: "location",
              label: "Location (optional)",
              value: location,
              onChangeText: setLocation,
              placeholder: "Northfield Library",
            },
          ]}
        />

        <ChipRow
          label="Date"
          items={days.map((d) => formatDayLabel(d.date))}
          active={days.map((_, index) => index === selectedDayIndex)}
          onPress={setSelectedDayIndex}
        />
        <ChipRow
          label="Time"
          items={TIME_OPTIONS.map((t) => t.label)}
          active={TIME_OPTIONS.map((_, index) => index === selectedTimeIndex)}
          onPress={setSelectedTimeIndex}
        />

        <NoticeCard
          title="Location privacy"
          body="This private family event is never shared to Community."
        />

        {createCalendarItem.isError ? (
          <NoticeCard title="Could not save this item" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={createCalendarItem.isPending ? "Saving..." : "Add to calendar"}
          onPrimaryPress={canSave && !createCalendarItem.isPending ? handleSave : undefined}
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
