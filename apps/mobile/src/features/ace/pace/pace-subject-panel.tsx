import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { StandardButton } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import type { PaceRosterItem } from "@/lib/api/pace";

export type PaceAssessmentDraft = {
  paceNumber: string;
  assessmentType: "SelfTest" | "FinalTest";
  score: string;
  reason: string;
};

type PaceSubjectPanelProps = {
  items: PaceRosterItem[];
  selectedSubjectId: string | null;
  draft: PaceAssessmentDraft;
  disabled: boolean;
  validation: Partial<Record<keyof PaceAssessmentDraft, string>>;
  onSelectSubject: (item: PaceRosterItem) => void;
  onChange: (field: keyof PaceAssessmentDraft, value: string) => void;
  onSubmit: () => void;
};

export function PaceSubjectPanel({
  items,
  selectedSubjectId,
  draft,
  disabled,
  validation,
  onSelectSubject,
  onChange,
  onSubmit,
}: PaceSubjectPanelProps) {
  const selectedSubject =
    items.find((item) => item.subject.id === selectedSubjectId) ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.subjectList}>
        {items.map((item) => {
          const selected = selectedSubjectId === item.subject.id;
          return (
            <Pressable
              key={item.subject.id}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`Choose ${item.subject.name}, current PACE ${item.currentPace}`}
              disabled={disabled}
              onPress={() => onSelectSubject(item)}
              style={({ pressed }) => [
                styles.subjectButton,
                selected ? styles.selectedSubjectButton : undefined,
                pressed && !disabled ? styles.pressed : undefined,
              ]}
            >
              <View style={styles.subjectTextWrap}>
                <Text style={styles.subjectName}>{item.subject.name}</Text>
                <Text style={styles.subjectMeta}>
                  Current PACE {item.currentPace} · Target {item.targetPace}
                </Text>
              </View>
              {selected ? (
                <Text style={styles.selectedLabel}>Selected</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selectedSubject ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            Record {selectedSubject.subject.name} assessment
          </Text>
          <Field label="PACE number" error={validation.paceNumber}>
            <TextInput
              accessibilityLabel="PACE number"
              editable={!disabled}
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={(value) => onChange("paceNumber", value)}
              style={styles.input}
              value={draft.paceNumber}
            />
          </Field>
          <Field label="Assessment type" error={validation.assessmentType}>
            <View style={styles.typeOptions}>
              <TypeButton
                label="Self Test"
                selected={draft.assessmentType === "SelfTest"}
                disabled={disabled}
                onPress={() => onChange("assessmentType", "SelfTest")}
              />
              <TypeButton
                label="PACE Test"
                selected={draft.assessmentType === "FinalTest"}
                disabled={disabled}
                onPress={() => onChange("assessmentType", "FinalTest")}
              />
            </View>
          </Field>
          <Field label="Score (0–100)" error={validation.score}>
            <TextInput
              accessibilityLabel="Score from 0 to 100"
              editable={!disabled}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={3}
              onChangeText={(value) => onChange("score", value)}
              style={styles.input}
              value={draft.score}
            />
          </Field>
          <Field label="Reason" error={validation.reason}>
            <TextInput
              accessibilityLabel="Assessment reason"
              editable={!disabled}
              multiline
              onChangeText={(value) => onChange("reason", value)}
              placeholder="For example, supervised PACE test"
              placeholderTextColor={mobileTokens.colors.text.subtle}
              style={[styles.input, styles.reasonInput]}
              textAlignVertical="top"
              value={draft.reason}
            />
          </Field>
          <StandardButton
            disabled={disabled}
            label={disabled ? "Recording…" : "Record assessment"}
            onPress={onSubmit}
            size="large"
            tone="serve"
          />
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function TypeButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.typeButton,
        selected ? styles.selectedTypeButton : undefined,
        pressed && !disabled ? styles.pressed : undefined,
      ]}
    >
      <Text style={styles.typeButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: mobileTokens.spacing.md,
  },
  subjectList: {
    gap: mobileTokens.spacing.xs,
  },
  subjectButton: {
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
  },
  selectedSubjectButton: {
    borderWidth: 2,
    borderColor: mobileTokens.colors.accent.serve,
    backgroundColor: "#F2F8F6",
  },
  subjectTextWrap: {
    flex: 1,
    gap: mobileTokens.spacing.xxxs,
  },
  subjectName: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  subjectMeta: {
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
  form: {
    gap: mobileTokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.md,
  },
  formTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.heading.xs.size,
    lineHeight: mobileTokens.typography.heading.xs.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  field: {
    gap: mobileTokens.spacing.xxs,
  },
  label: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    paddingHorizontal: mobileTokens.spacing.sm,
    paddingVertical: mobileTokens.spacing.xs,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
    backgroundColor: mobileTokens.colors.bg.surface,
  },
  reasonInput: {
    minHeight: 96,
  },
  typeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  typeButton: {
    minHeight: 52,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    paddingHorizontal: mobileTokens.spacing.md,
    paddingVertical: mobileTokens.spacing.xs,
  },
  selectedTypeButton: {
    borderWidth: 2,
    borderColor: mobileTokens.colors.accent.serve,
    backgroundColor: "#F2F8F6",
  },
  typeButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  error: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: "#B42318",
  },
  pressed: {
    opacity: 0.86,
  },
});
