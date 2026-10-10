import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  fetchBehaviourReviewRequests,
  fetchDemeritStatus,
  toBehaviourApiError,
  type BehaviourChild,
  type BehaviourReviewResponse,
  type DemeritOverrideResponse,
  type DemeritStatus,
} from "@/lib/api/behaviour";
import { BehaviourReviewRequests } from "./behaviour-review-requests";
import { styles } from "./behaviour-stage-review.styles";
import { BehaviourStageDetails } from "./behaviour-stage-details";
import { isValidSiteDate, siteToday } from "./behaviour-time";

export type StageView =
  | { kind: "idle" | "loading" | "denied" | "error" }
  | { kind: "ready"; value: DemeritStatus | null };

export type ReviewView =
  | { kind: "idle" | "loading" | "denied" | "error" }
  | { kind: "ready"; value: BehaviourReviewResponse };

export function BehaviourStageReview({
  children,
  siteTimeZone,
  canSensitive,
  canManagePolicy,
  accessLoading,
  refreshKey,
}: {
  children: BehaviourChild[];
  siteTimeZone: string;
  canSensitive: boolean;
  canManagePolicy: boolean;
  accessLoading: boolean;
  refreshKey: number;
}) {
  const [childId, setChildId] = useState("");
  const [date, setDate] = useState(() => siteToday(siteTimeZone));
  const [status, setStatus] = useState<StageView>({ kind: "idle" });
  const [reviews, setReviews] = useState<ReviewView>({ kind: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [commandFeedback, setCommandFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const requestVersion = useRef(0);
  const today = siteToday(siteTimeZone);
  const validDate = isValidSiteDate(date, today);
  const retry = () => {
    requestVersion.current += 1;
    setReloadKey((current) => current + 1);
  };

  useEffect(() => {
    if (!childId || !canSensitive || !validDate || accessLoading) {
      setStatus((current) =>
        current.kind === "idle" ? current : { kind: "idle" },
      );
      setReviews((current) =>
        current.kind === "idle" ? current : { kind: "idle" },
      );
      return;
    }
    let active = true;
    const version = requestVersion.current;
    setStatus({ kind: "loading" });
    setReviews(canManagePolicy ? { kind: "loading" } : { kind: "idle" });
    void fetchDemeritStatus(childId, date)
      .then((value) => {
        if (active && version === requestVersion.current)
          setStatus({ kind: "ready", value });
      })
      .catch((cause: unknown) => {
        if (active && version === requestVersion.current)
          setStatus({ kind: isDenied(cause) ? "denied" : "error" });
      });
    if (canManagePolicy) {
      void fetchBehaviourReviewRequests(childId)
        .then((value) => {
          if (active && version === requestVersion.current)
            setReviews({ kind: "ready", value });
        })
        .catch((cause: unknown) => {
          if (active && version === requestVersion.current)
            setReviews({ kind: isDenied(cause) ? "denied" : "error" });
        });
    }
    return () => {
      active = false;
    };
  }, [
    childId,
    date,
    canSensitive,
    canManagePolicy,
    validDate,
    accessLoading,
    refreshKey,
    reloadKey,
  ]);

  if (accessLoading) {
    return <Text style={styles.muted}>Refreshing behaviour access…</Text>;
  }

  if (!canSensitive) {
    return (
      <Text style={styles.muted} accessibilityRole="alert">
        Stage details require sensitive behaviour access.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.muted}>
        Select a learner and site-local date to view the current stage.
      </Text>
      <Text style={styles.label}>Learner</Text>
      {children.length === 0 ? (
        <Text style={styles.muted}>
          No learners are available for this site.
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" style={styles.choices}>
          {children.map((child) => (
            <Pressable
              key={child.id}
              accessibilityRole="radio"
              accessibilityState={{
                selected: childId === child.id,
                disabled: saving,
              }}
              disabled={saving}
              onPress={() => {
                if (childId === child.id) return;
                requestVersion.current += 1;
                setStatus({ kind: "idle" });
                setReviews({ kind: "idle" });
                setCommandFeedback(null);
                setChildId(child.id);
              }}
              style={({ pressed }) => [
                styles.choice,
                childId === child.id && styles.selectedChoice,
                pressed && !saving && styles.pressed,
                saving && styles.disabled,
              ]}
            >
              <Text style={styles.choiceText}>{child.displayName}</Text>
              {childId === child.id ? (
                <Text style={styles.selectedText}>Selected</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.label}>Site-local date</Text>
          <TextInput
            accessibilityLabel="Site-local date"
            editable={!saving}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            onChangeText={(value) => {
              if (value === date) return;
              requestVersion.current += 1;
              setStatus({ kind: "idle" });
              setReviews({ kind: "idle" });
              setCommandFeedback(null);
              setDate(value);
            }}
            placeholder="YYYY-MM-DD"
            style={styles.input}
            value={date}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => {
            const next = siteToday(siteTimeZone);
            if (next === date) {
              retry();
              return;
            }
            requestVersion.current += 1;
            setStatus({ kind: "idle" });
            setReviews({ kind: "idle" });
            setCommandFeedback(null);
            setDate(next);
          }}
          style={({ pressed }) => [
            styles.todayButton,
            pressed && !saving && styles.pressed,
            saving && styles.disabled,
          ]}
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      {!validDate ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Enter a valid date as YYYY-MM-DD, on or before today at this site.
        </Text>
      ) : null}
      {!childId ? (
        <Text style={styles.muted}>Choose a learner to view their stage.</Text>
      ) : null}
      {commandFeedback ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole={
            commandFeedback.tone === "error" ? "alert" : undefined
          }
          style={
            commandFeedback.tone === "error"
              ? styles.feedbackError
              : styles.success
          }
        >
          {commandFeedback.message}
        </Text>
      ) : null}
      {childId && validDate ? (
        <BehaviourStageDetails
          key={`${childId}-${date}`}
          childId={childId}
          date={date}
          today={today}
          siteTimeZone={siteTimeZone}
          status={status}
          canEscalate={
            canManagePolicy && reviews.kind === "ready" && date === today
          }
          onDenied={() => {
            requestVersion.current += 1;
            setReviews({ kind: "denied" });
            setStatus({ kind: "denied" });
            setCommandFeedback({
              tone: "error",
              message:
                "Your reviewer access changed. Refresh before trying again.",
            });
          }}
          onPendingChange={(pending) => {
            setSaving(pending);
            if (pending) setCommandFeedback(null);
          }}
          onRetry={retry}
          onConflict={(message) => {
            setCommandFeedback({ tone: "error", message });
            retry();
          }}
          onSaved={async (response: DemeritOverrideResponse) => {
            setCommandFeedback({
              tone: "success",
              message: response.duplicate
                ? "This escalation was already saved."
                : "Escalation saved.",
            });
            retry();
          }}
        />
      ) : null}
      {childId && validDate && canManagePolicy ? (
        <BehaviourReviewRequests
          key={childId}
          childId={childId}
          siteTimeZone={siteTimeZone}
          reviews={reviews}
          onDenied={() => {
            requestVersion.current += 1;
            setReviews({ kind: "denied" });
            setStatus({ kind: "denied" });
          }}
          onRetry={retry}
        />
      ) : null}
    </View>
  );
}

function isDenied(cause: unknown): boolean {
  const status = toBehaviourApiError(cause).status;
  return status === 401 || status === 403;
}
