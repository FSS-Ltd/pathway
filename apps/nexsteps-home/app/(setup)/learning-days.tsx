import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { ChipRow, ContentCard, NoticeCard, ScreenActions, ScreenHeader } from "@/components/primitives";
import { homeTokens } from "@/design/tokens";
import type { WeekdayLabel } from "@/lib/api/household-setup";
import { useUpdateLearningDays } from "@/lib/queries/household-setup";

const WEEKDAYS: WeekdayLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SUGGESTED: WeekdayLabel[] = ["Mon", "Tue", "Wed", "Thu"];

export default function LearningDaysScreen() {
  const [selected, setSelected] = useState<WeekdayLabel[]>(SUGGESTED);
  const updateLearningDays = useUpdateLearningDays();

  const toggle = (index: number) => {
    const day = WEEKDAYS[index];
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleContinue = () => {
    updateLearningDays.mutate(selected, {
      onSuccess: () => router.push("/(setup)/first-activity"),
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="Setup · 2 of 3"
          title="Choose your learning days"
          description="This shapes Week. You can still learn on any day."
        />

        <ChipRow
          label="Tap to include"
          items={WEEKDAYS}
          active={WEEKDAYS.map((day) => selected.includes(day))}
          onPress={toggle}
        />

        <ContentCard
          title="Four-day rhythm"
          body="Monday to Thursday are highlighted. Friday remains flexible."
          meta="Suggested"
          tone="mint"
        />

        {updateLearningDays.isError ? (
          <NoticeCard title="Could not save your choice" body="Check your connection and try again." tone="danger" />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ScreenActions
          primaryLabel={updateLearningDays.isPending ? "Saving..." : "Use these days"}
          onPrimaryPress={!updateLearningDays.isPending ? handleContinue : undefined}
          secondaryLabel="Choose later"
          onSecondaryPress={() => router.push("/(setup)/first-activity")}
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
