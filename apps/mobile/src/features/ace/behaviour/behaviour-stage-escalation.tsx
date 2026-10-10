import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { StandardButton } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import {
  createDemeritOverride,
  toBehaviourApiError,
  type DemeritOverrideResponse,
  type DemeritStatus,
} from "@/lib/api/behaviour";
import { siteToday } from "./behaviour-time";

export function BehaviourStageEscalation({
  childId,
  date,
  siteTimeZone,
  status,
  onDenied,
  onPendingChange,
  onConflict,
  onSaved,
}: {
  childId: string;
  date: string;
  siteTimeZone: string;
  status: DemeritStatus;
  onDenied: () => void;
  onPendingChange: (pending: boolean) => void;
  onConflict: (message: string) => void;
  onSaved: (response: DemeritOverrideResponse) => Promise<void>;
}) {
  const [stage, setStage] = useState(status.stage + 1);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createCommandKey);
  const attempted = useRef(false);
  const submitting = useRef(false);

  const edit = () => {
    if (attempted.current) {
      attempted.current = false;
      setIdempotencyKey(createCommandKey());
    }
    setError(null);
  };

  const submit = () => {
    if (submitting.current) return;
    if (siteToday(siteTimeZone) !== date) {
      onConflict("The site-local day changed. Select today before escalating.");
      return;
    }
    if (!Number.isInteger(stage) || stage <= status.stage || stage > 3) return;
    if (!reason.trim()) {
      setReasonError("Enter a reason for this escalation.");
      return;
    }
    submitting.current = true;
    attempted.current = true;
    setSaving(true);
    onPendingChange(true);
    setError(null);
    void createDemeritOverride({
      childId,
      stage,
      expectedPolicyVersion: status.policyVersion,
      reason: reason.trim(),
      idempotencyKey,
    })
      .then(async (response) => {
        setReason("");
        setReasonError(null);
        setIdempotencyKey(createCommandKey());
        attempted.current = false;
        await onSaved(response);
      })
      .catch((cause: unknown) => {
        const failure = toBehaviourApiError(cause);
        if (failure.status === 401 || failure.status === 403) {
          onDenied();
          setError(
            "Your reviewer access changed. Refresh before trying again.",
          );
        } else if (failure.status === 409) {
          onConflict(
            "The stage or policy changed. Refresh before trying again.",
          );
        } else {
          setError("Unable to save this escalation. Try again.");
        }
      })
      .finally(() => {
        submitting.current = false;
        setSaving(false);
        onPendingChange(false);
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Escalate today’s stage</Text>
      <Text style={styles.label}>New stage</Text>
      <View accessibilityRole="radiogroup" style={styles.stageChoices}>
        {Array.from(
          { length: 3 - status.stage },
          (_, index) => status.stage + index + 1,
        ).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{
              selected: stage === option,
              disabled: saving,
            }}
            disabled={saving}
            onPress={() => {
              edit();
              setStage(option);
            }}
            style={({ pressed }) => [
              styles.stageChoice,
              stage === option && styles.selectedChoice,
              pressed && !saving && styles.pressed,
              saving && styles.disabled,
            ]}
          >
            <Text style={styles.stageChoiceText}>Stage {option}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Reason</Text>
      <TextInput
        accessibilityLabel="Escalation reason"
        editable={!saving}
        maxLength={1000}
        multiline
        onChangeText={(value) => {
          edit();
          setReason(value);
          setReasonError(null);
        }}
        placeholder="Why does this stage need escalation?"
        style={styles.reasonInput}
        textAlignVertical="top"
        value={reason}
      />
      {reasonError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {reasonError}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <StandardButton
        disabled={saving}
        label={saving ? "Saving escalation…" : "Save escalation"}
        onPress={submit}
        size="large"
        tone="serve"
        multiline
      />
    </View>
  );
}

function createCommandKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `behaviour-stage-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const styles = StyleSheet.create({
  container: {
    gap: mobileTokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.sm,
  },
  heading: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.primary,
  },
  label: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  stageChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
  },
  stageChoice: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    paddingHorizontal: mobileTokens.spacing.md,
    justifyContent: "center",
  },
  selectedChoice: { borderColor: mobileTokens.colors.accent.serve },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  stageChoiceText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  reasonInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.strong,
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  error: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: "#B42318",
  },
});
