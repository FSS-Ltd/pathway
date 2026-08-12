import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { StandardButton } from "@/components/primitives/ui";
import { mobileTokens } from "@/design/tokens";
import type {
  BehaviourChild,
  BehaviourCommandInput,
  BehaviourCommandResponse,
  BehaviourEntry,
} from "@/lib/api/behaviour";

type BehaviourHistoryListProps = {
  items: BehaviourEntry[];
  children: BehaviourChild[];
  canCorrect: boolean;
  disabled: boolean;
  onCorrect: (
    entryId: string,
    input: BehaviourCommandInput,
  ) => Promise<BehaviourCommandResponse>;
  onSuccess: (response: BehaviourCommandResponse) => Promise<void> | void;
};

export function BehaviourHistoryList({
  items,
  children,
  canCorrect,
  disabled,
  onCorrect,
  onSuccess,
}: BehaviourHistoryListProps) {
  const names = new Map(children.map((child) => [child.id, child.displayName]));
  const [correctionTarget, setCorrectionTarget] = useState<string | null>(null);

  if (items.length === 0) {
    return <Text style={styles.stateText}>No behaviour records yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.id} style={styles.entry}>
          <Text style={styles.entryTitle}>
            {names.get(item.childId) ?? "Learner"} ·{" "}
            {formatCategory(item.category)}
          </Text>
          <Text style={styles.entryMeta}>
            {formatType(item.type)} · {formatPoints(item.pointsDelta)} ·{" "}
            {formatDateTime(item.occurredAt)}
          </Text>
          <Text style={styles.entryReason}>{item.reason}</Text>
          {item.note ? <Text style={styles.entryNote}>{item.note}</Text> : null}
          {canCorrect ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => setCorrectionTarget(item.id)}
              style={styles.correctButton}
            >
              <Text style={styles.correctButtonText}>Correct record</Text>
            </Pressable>
          ) : null}
          {correctionTarget === item.id ? (
            <CorrectionForm
              entry={item}
              onCancel={() => setCorrectionTarget(null)}
              onCorrect={onCorrect}
              onSuccess={async (response) => {
                setCorrectionTarget(null);
                await onSuccess(response);
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function CorrectionForm({
  entry,
  onCancel,
  onCorrect,
  onSuccess,
}: {
  entry: BehaviourEntry;
  onCancel: () => void;
  onCorrect: BehaviourHistoryListProps["onCorrect"];
  onSuccess: BehaviourHistoryListProps["onSuccess"];
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [idempotencyKey] = useState(createCommandKey);
  const submitting = useRef(false);

  const submit = () => {
    if (submitting.current) return;
    if (!reason.trim()) {
      setReasonError("Enter a reason for this correction.");
      return;
    }
    submitting.current = true;
    setIsSaving(true);
    setError(null);
    const note = entry.note?.trim();
    void onCorrect(entry.id, {
      idempotencyKey,
      childId: entry.childId,
      category: entry.category,
      type: entry.type,
      visibility: entry.visibility,
      pointsDelta: entry.pointsDelta,
      occurredAt: entry.occurredAt,
      reason: reason.trim(),
      ...(note ? { note } : {}),
    })
      .then(onSuccess)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Unable to correct this behaviour record.",
        );
      })
      .finally(() => {
        submitting.current = false;
        setIsSaving(false);
      });
  };

  return (
    <View style={styles.correction}>
      <Text style={styles.label}>Correction reason</Text>
      <TextInput
        accessibilityLabel="Correction reason"
        editable={!isSaving}
        maxLength={1000}
        multiline
        onChangeText={(value) => {
          setReason(value);
          setReasonError(null);
        }}
        style={[styles.input, styles.textArea]}
        textAlignVertical="top"
        value={reason}
      />
      {reasonError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {reasonError}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <StandardButton
          disabled={isSaving}
          label={isSaving ? "Saving…" : "Save correction"}
          onPress={submit}
          size="medium"
          tone="serve"
          style={styles.flexButton}
        />
        <StandardButton
          disabled={isSaving}
          label="Cancel"
          onPress={onCancel}
          size="medium"
          tone="serve"
          variant="white"
          style={styles.flexButton}
        />
      </View>
    </View>
  );
}

function formatCategory(category: string): string {
  return category
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatType(type: BehaviourEntry["type"]): string {
  if (type === "MERIT") return "Merit";
  if (type === "DEMERIT") return "Demerit";
  return "General";
}

function formatPoints(points: number): string {
  if (points > 0) return `+${points} points`;
  if (points < 0) return `${points} points`;
  return "No points";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createCommandKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `behaviour-correction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const styles = StyleSheet.create({
  list: { gap: mobileTokens.spacing.sm },
  entry: {
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.sm,
    gap: mobileTokens.spacing.xxs,
  },
  entryTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  entryMeta: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  entryReason: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  entryNote: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  correctButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    borderRadius: mobileTokens.radius.md,
    marginTop: mobileTokens.spacing.xs,
  },
  correctButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  correction: {
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.sm,
    marginTop: mobileTokens.spacing.xs,
    gap: mobileTokens.spacing.xxs,
  },
  label: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
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
    color: mobileTokens.colors.text.primary,
  },
  textArea: { minHeight: 88 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTokens.spacing.xs,
    marginTop: mobileTokens.spacing.xs,
  },
  flexButton: { flexGrow: 1 },
  errorText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: "#B42318",
  },
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
});
