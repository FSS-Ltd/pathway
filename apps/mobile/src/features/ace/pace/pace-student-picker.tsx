import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileTokens } from "@/design/tokens";
import type { PaceRosterItem } from "@/lib/api/pace";

type PaceStudentPickerProps = {
  items: PaceRosterItem[];
  selectedChildId: string | null;
  disabled: boolean;
  onSelect: (childId: string) => void;
};

export function PaceStudentPicker({
  items,
  selectedChildId,
  disabled,
  onSelect,
}: PaceStudentPickerProps) {
  const students = uniqueStudents(items);

  return (
    <View accessibilityLabel="Choose a learner" style={styles.list}>
      {students.map((student) => {
        const selected = selectedChildId === student.id;
        return (
          <Pressable
            key={student.id}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`Choose ${student.displayName}`}
            disabled={disabled}
            onPress={() => onSelect(student.id)}
            style={({ pressed }) => [
              styles.row,
              selected ? styles.selectedRow : undefined,
              pressed && !disabled ? styles.pressed : undefined,
            ]}
          >
            <View style={styles.textWrap}>
              <Text style={styles.name}>{student.displayName}</Text>
              <Text style={styles.meta}>
                {student.subjectCount} subject
                {student.subjectCount === 1 ? "" : "s"} available
              </Text>
            </View>
            {selected ? (
              <Text style={styles.selectedLabel}>Selected</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function uniqueStudents(items: PaceRosterItem[]): Array<{
  id: string;
  displayName: string;
  subjectCount: number;
}> {
  const byId = new Map<
    string,
    { id: string; displayName: string; subjectCount: number }
  >();

  for (const item of items) {
    const existing = byId.get(item.child.id);
    if (existing) {
      existing.subjectCount += 1;
    } else {
      byId.set(item.child.id, {
        id: item.child.id,
        displayName: item.child.displayName,
        subjectCount: 1,
      });
    }
  }

  return Array.from(byId.values());
}

const styles = StyleSheet.create({
  list: {
    gap: mobileTokens.spacing.xs,
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.md,
    paddingVertical: mobileTokens.spacing.sm,
    backgroundColor: mobileTokens.colors.bg.surface,
  },
  selectedRow: {
    borderColor: mobileTokens.colors.accent.serve,
    borderWidth: 2,
    backgroundColor: "#F2F8F6",
  },
  textWrap: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  name: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  meta: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  selectedLabel: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.accent.serve,
  },
  pressed: {
    opacity: 0.86,
  },
});
