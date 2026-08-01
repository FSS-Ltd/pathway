import { Pressable, StyleSheet, Text, View } from "react-native";

import { homeTokens } from "@/design/tokens";

export type WeekDay = {
  day: string;
  date: string;
  count?: number;
};

export function WeekStrip({
  activeDay,
  days,
  onSelectDay,
}: {
  activeDay: string;
  days: WeekDay[];
  onSelectDay?: (day: WeekDay) => void;
}) {
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const isActive = day.day === activeDay;
        return (
          <Pressable
            key={day.day}
            onPress={onSelectDay ? () => onSelectDay(day) : undefined}
            disabled={!onSelectDay}
            accessibilityRole={onSelectDay ? "button" : undefined}
            accessibilityState={onSelectDay ? { selected: isActive } : undefined}
            accessibilityLabel={`${day.day} ${day.date}${day.count ? `, ${day.count} items` : ""}`}
            style={[styles.day, isActive ? styles.dayActive : undefined]}
          >
            <Text style={[styles.dayLabel, isActive ? styles.dayLabelActive : undefined]}>
              {day.day}
            </Text>
            <Text style={[styles.dateLabel, isActive ? styles.dayLabelActive : undefined]}>
              {day.date}
            </Text>
            {day.count ? (
              <View style={[styles.countDot, isActive ? styles.countDotActive : undefined]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
  },
  day: {
    flex: 1,
    minHeight: homeTokens.metrics.weekDayMinHeight,
    borderRadius: 14,
    backgroundColor: homeTokens.colors.bg.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: homeTokens.spacing.xxxs,
  },
  dayActive: {
    backgroundColor: homeTokens.colors.accent.primary,
  },
  dayLabel: {
    fontFamily: homeTokens.typography.bodyFamily.semibold,
    fontWeight: homeTokens.typography.weight.semibold,
    fontSize: homeTokens.typography.body.xs.size,
    color: homeTokens.colors.text.muted,
  },
  dateLabel: {
    fontFamily: homeTokens.typography.headingFamily.bold,
    fontWeight: homeTokens.typography.weight.bold,
    fontSize: homeTokens.typography.body.md.size,
    color: homeTokens.colors.text.primary,
  },
  dayLabelActive: {
    color: homeTokens.colors.text.onAccent,
  },
  countDot: {
    width: 5,
    height: 5,
    borderRadius: homeTokens.radius.round,
    backgroundColor: homeTokens.colors.accent.strong,
  },
  countDotActive: {
    backgroundColor: homeTokens.colors.text.onAccent,
  },
});
