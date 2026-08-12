import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { StandardButton } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import type {
  BehaviourCategory,
  BehaviourChild,
  BehaviourType,
  BehaviourVisibility,
} from "@/lib/api/behaviour";

export type BehaviourDraft = {
  childId: string | null;
  category: string | null;
  pointsDelta: string;
  occurredAt: string;
  reason: string;
  note: string;
  idempotencyKey: string;
};

export type BehaviourDraftValidation = Partial<
  Record<"childId" | "category" | "pointsDelta" | "reason", string>
>;

type BehaviourCaptureFormProps = {
  children: BehaviourChild[];
  categories: BehaviourCategory[];
  canSensitive: boolean;
  disabled: boolean;
  draft: BehaviourDraft;
  validation: BehaviourDraftValidation;
  visibility: BehaviourVisibility;
  onChange: (field: keyof BehaviourDraft, value: string) => void;
  onSelectChild: (childId: string) => void;
  onSelectCategory: (category: BehaviourCategory) => void;
  onSelectVisibility: (visibility: BehaviourVisibility) => void;
  onSubmit: () => void;
};

export function BehaviourCaptureForm({
  children,
  categories,
  canSensitive,
  disabled,
  draft,
  validation,
  visibility,
  onChange,
  onSelectChild,
  onSelectCategory,
  onSelectVisibility,
  onSubmit,
}: BehaviourCaptureFormProps) {
  const availableCategories = categories.filter(
    (category) =>
      category.isActive &&
      category.visibility === visibility &&
      (category.visibility === "GENERAL" || canSensitive),
  );

  return (
    <View style={styles.container}>
      <Field label="Learner" error={validation.childId}>
        <View accessibilityRole="radiogroup" style={styles.optionList}>
          {children.map((child) => (
            <Choice
              key={child.id}
              label={child.displayName}
              selected={draft.childId === child.id}
              disabled={disabled}
              onPress={() => onSelectChild(child.id)}
            />
          ))}
        </View>
      </Field>

      {canSensitive ? (
        <Field label="Record visibility">
          <View accessibilityRole="radiogroup" style={styles.rowOptions}>
            <Choice
              label="General records"
              selected={visibility === "GENERAL"}
              disabled={disabled}
              onPress={() => onSelectVisibility("GENERAL")}
              flexible
            />
            <Choice
              label="Sensitive records"
              selected={visibility === "SENSITIVE"}
              disabled={disabled}
              onPress={() => onSelectVisibility("SENSITIVE")}
              flexible
            />
          </View>
        </Field>
      ) : null}

      {visibility === "SENSITIVE" && canSensitive ? (
        <View accessibilityRole="alert" style={styles.warning}>
          <Text style={styles.warningText}>
            You are creating a restricted behaviour record. Only authorised
            staff can view or correct it.
          </Text>
        </View>
      ) : null}

      <Field label="Category" error={validation.category}>
        <View accessibilityRole="radiogroup" style={styles.optionList}>
          {availableCategories.map((category) => (
            <Choice
              key={category.code}
              label={category.label}
              supportingText={typeLabel(category.type)}
              selected={draft.category === category.code}
              disabled={disabled}
              onPress={() => onSelectCategory(category)}
            />
          ))}
          {availableCategories.length === 0 ? (
            <Text style={styles.stateText}>
              No active categories are available in this mode.
            </Text>
          ) : null}
        </View>
      </Field>

      <Field label="Points" error={validation.pointsDelta}>
        <TextInput
          accessibilityLabel="Behaviour points"
          editable={!disabled}
          inputMode="numeric"
          keyboardType="numbers-and-punctuation"
          onChangeText={(value) => onChange("pointsDelta", value)}
          style={styles.input}
          value={draft.pointsDelta}
        />
      </Field>
      <Field label="Reason" error={validation.reason}>
        <TextInput
          accessibilityLabel="Behaviour reason"
          editable={!disabled}
          maxLength={1000}
          multiline
          onChangeText={(value) => onChange("reason", value)}
          placeholder="Describe the observed behaviour"
          placeholderTextColor={mobileTokens.colors.text.subtle}
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={draft.reason}
        />
      </Field>
      <Field label="Note (optional)">
        <TextInput
          accessibilityLabel="Behaviour note"
          editable={!disabled}
          maxLength={4000}
          multiline
          onChangeText={(value) => onChange("note", value)}
          placeholder="Add relevant context"
          placeholderTextColor={mobileTokens.colors.text.subtle}
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={draft.note}
        />
      </Field>
      <StandardButton
        disabled={disabled}
        label={disabled ? "Recording…" : "Record behaviour"}
        onPress={onSubmit}
        size="large"
        tone="serve"
      />
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
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Choice({
  label,
  supportingText,
  selected,
  disabled,
  flexible = false,
  onPress,
}: {
  label: string;
  supportingText?: string;
  selected: boolean;
  disabled: boolean;
  flexible?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        flexible ? styles.flexibleChoice : undefined,
        selected ? styles.selectedChoice : undefined,
        pressed && !disabled ? styles.pressed : undefined,
      ]}
    >
      <View style={styles.choiceText}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {supportingText ? (
          <Text style={styles.choiceSupporting}>{supportingText}</Text>
        ) : null}
      </View>
      {selected ? <Text style={styles.selectedText}>Selected</Text> : null}
    </Pressable>
  );
}

function typeLabel(type: BehaviourType): string {
  if (type === "MERIT") return "Merit";
  if (type === "DEMERIT") return "Demerit";
  return "General";
}

const styles = StyleSheet.create({
  container: { gap: mobileTokens.spacing.md },
  field: { gap: mobileTokens.spacing.xxs },
  label: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  optionList: { gap: mobileTokens.spacing.xs },
  rowOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  choice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileTokens.spacing.sm,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.lg,
    paddingHorizontal: mobileTokens.spacing.md,
    paddingVertical: mobileTokens.spacing.xs,
  },
  flexibleChoice: { flexGrow: 1, flexBasis: 140 },
  selectedChoice: {
    borderWidth: 2,
    borderColor: mobileTokens.colors.accent.serve,
    backgroundColor: "#F2F8F6",
  },
  choiceText: { flex: 1 },
  choiceLabel: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  choiceSupporting: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  selectedText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.sm.size,
    color: mobileTokens.colors.accent.serve,
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
  textArea: { minHeight: 96 },
  warning: {
    borderWidth: 1,
    borderColor: "#B54708",
    borderRadius: mobileTokens.radius.md,
    backgroundColor: "#FFFAEB",
    padding: mobileTokens.spacing.sm,
  },
  warningText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: "#7A2E0E",
  },
  errorText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: "#B42318",
  },
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  pressed: { opacity: 0.86 },
});
