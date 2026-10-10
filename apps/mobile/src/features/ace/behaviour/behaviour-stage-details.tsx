import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileTokens } from "@/design/tokens";
import type { DemeritOverrideResponse } from "@/lib/api/behaviour";
import { BehaviourStageEscalation } from "./behaviour-stage-escalation";
import { formatSiteDateTime } from "./behaviour-time";
import type { StageView } from "./behaviour-stage-review";

export function BehaviourStageDetails({
  childId,
  date,
  today,
  siteTimeZone,
  status,
  canEscalate,
  onDenied,
  onPendingChange,
  onRetry,
  onConflict,
  onSaved,
}: {
  childId: string;
  date: string;
  today: string;
  siteTimeZone: string;
  status: StageView;
  canEscalate: boolean;
  onDenied: () => void;
  onPendingChange: (pending: boolean) => void;
  onRetry: () => void;
  onConflict: (message: string) => void;
  onSaved: (response: DemeritOverrideResponse) => Promise<void>;
}) {
  if (status.kind === "idle" || status.kind === "loading") {
    return <Text style={styles.muted}>Loading stage…</Text>;
  }
  if (status.kind === "denied") {
    return (
      <Text accessibilityRole="alert" style={styles.error}>
        Stage access is no longer available.
      </Text>
    );
  }
  if (status.kind === "error") {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="alert" style={styles.error}>
          Unable to load the stage.
        </Text>
        <RetryButton onPress={onRetry} />
      </View>
    );
  }
  if (status.kind !== "ready") return null;
  if (!status.value) {
    return (
      <Text style={styles.muted}>No demerit policy applies on this date.</Text>
    );
  }

  const current = status.value;
  return (
    <View style={styles.container}>
      <View style={styles.stagePanel}>
        <Text style={styles.muted}>Current stage · {current.date}</Text>
        <Text style={styles.stageLabel}>{current.stageLabel}</Text>
        {current.headReview ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            Head review is required for this stage.
          </Text>
        ) : null}
        {current.manualStage !== null && current.manualExpiresAt ? (
          <Text style={styles.muted}>
            Manual stage {current.manualStage} ends{" "}
            {formatSiteDateTime(current.manualExpiresAt, siteTimeZone)}.
          </Text>
        ) : null}
        {current.requiresNote ? (
          <Text style={styles.muted}>
            A note is required when recording a demerit at this stage.
          </Text>
        ) : null}
        {date !== today ? (
          <Text style={styles.muted}>
            Escalation is available only for the current site-local date.
          </Text>
        ) : null}
      </View>
      {canEscalate && current.stage < 3 ? (
        <BehaviourStageEscalation
          childId={childId}
          date={date}
          siteTimeZone={siteTimeZone}
          status={current}
          onDenied={onDenied}
          onPendingChange={onPendingChange}
          onConflict={onConflict}
          onSaved={onSaved}
        />
      ) : null}
    </View>
  );
}

export function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
    >
      <Text style={styles.retryText}>Try again</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: mobileTokens.spacing.sm },
  stagePanel: {
    gap: mobileTokens.spacing.xs,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.lg,
    padding: mobileTokens.spacing.sm,
  },
  stageLabel: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.lg.size,
    color: mobileTokens.colors.text.primary,
  },
  muted: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  notice: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
    backgroundColor: "#FFFAEB",
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
  },
  error: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: "#B42318",
  },
  retry: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    borderRadius: mobileTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  retryText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
});
