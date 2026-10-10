import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { mobileTokens } from "@/design/tokens";
import {
  fetchBehaviourReviewFact,
  fetchBehaviourReviewRequests,
  toBehaviourApiError,
  type BehaviourEntry,
  type BehaviourReviewRequest,
} from "@/lib/api/behaviour";
import { RetryButton } from "./behaviour-stage-details";
import { formatSiteDateTime } from "./behaviour-time";
import type { ReviewView } from "./behaviour-stage-review";

type FactView =
  | { kind: "idle" | "loading" | "error"; requestId: string | null }
  | { kind: "ready"; requestId: string; entry: BehaviourEntry };

export function BehaviourReviewRequests({
  childId,
  siteTimeZone,
  reviews,
  onDenied,
  onRetry,
}: {
  childId: string;
  siteTimeZone: string;
  reviews: ReviewView;
  onDenied: () => void;
  onRetry: () => void;
}) {
  const [extraItems, setExtraItems] = useState<BehaviourReviewRequest[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [fact, setFact] = useState<FactView>({ kind: "idle", requestId: null });
  const factRequest = useRef(0);
  const listRequest = useRef(0);

  useEffect(() => {
    listRequest.current += 1;
    factRequest.current += 1;
    setExtraItems([]);
    setNextCursor(reviews.kind === "ready" ? reviews.value.nextCursor : null);
    setLoadingMore(false);
    setMoreError(false);
    setFact({ kind: "idle", requestId: null });
  }, [reviews]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const request = ++listRequest.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchBehaviourReviewRequests(childId, nextCursor);
      if (request !== listRequest.current) return;
      setExtraItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (request !== listRequest.current) return;
      if (isDenied(cause)) onDenied();
      else setMoreError(true);
    } finally {
      if (request === listRequest.current) setLoadingMore(false);
    }
  };

  const openFact = async (requestId: string) => {
    const request = ++factRequest.current;
    setFact({ kind: "loading", requestId });
    try {
      const response = await fetchBehaviourReviewFact(requestId);
      if (request === factRequest.current)
        setFact({ kind: "ready", requestId, entry: response.entry });
    } catch (cause) {
      if (request !== factRequest.current) return;
      if (isDenied(cause)) onDenied();
      else setFact({ kind: "error", requestId });
    }
  };

  if (reviews.kind === "loading" || reviews.kind === "idle") {
    return <Text style={styles.muted}>Checking reviewer access…</Text>;
  }
  if (reviews.kind === "denied") {
    return (
      <Text accessibilityRole="alert" style={styles.muted}>
        A current Head or Lead role is required to review or escalate a stage.
      </Text>
    );
  }
  if (reviews.kind === "error") {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="alert" style={styles.error}>
          Unable to verify your reviewer role.
        </Text>
        <RetryButton onPress={onRetry} />
      </View>
    );
  }
  if (reviews.kind !== "ready") return null;

  const items = [...reviews.value.items, ...extraItems];
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Review requests for this learner</Text>
      {items.length === 0 ? (
        <Text style={styles.muted}>No review requests yet.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemTitle}>
              {item.kind === "HEAD" ? "Head" : "Site"} review · Stage{" "}
              {item.stage}
            </Text>
            <Text style={styles.muted}>
              {formatSiteDateTime(item.requestedAt, siteTimeZone)}
            </Text>
            {item.behaviourEntryId ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled:
                      fact.kind === "loading" && fact.requestId === item.id,
                    expanded:
                      fact.kind === "ready" && fact.requestId === item.id,
                  }}
                  disabled={
                    fact.kind === "loading" && fact.requestId === item.id
                  }
                  onPress={() => {
                    if (fact.kind === "ready" && fact.requestId === item.id) {
                      factRequest.current += 1;
                      setFact({ kind: "idle", requestId: null });
                    } else {
                      void openFact(item.id);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.factButton,
                    pressed && styles.pressed,
                    fact.kind === "loading" &&
                      fact.requestId === item.id &&
                      styles.disabled,
                  ]}
                >
                  <Text style={styles.factButtonText}>
                    {fact.kind === "loading" && fact.requestId === item.id
                      ? "Loading fact…"
                      : fact.kind === "ready" && fact.requestId === item.id
                        ? "Hide current fact"
                        : "View current fact"}
                  </Text>
                </Pressable>
                {fact.kind === "error" && fact.requestId === item.id ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    Unable to open this fact. Try again.
                  </Text>
                ) : null}
                {fact.kind === "ready" && fact.requestId === item.id ? (
                  <ReviewFact
                    entry={fact.entry}
                    originalEntryId={item.behaviourEntryId}
                    siteTimeZone={siteTimeZone}
                  />
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>Manual stage escalation</Text>
            )}
          </View>
        ))
      )}
      {moreError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          Unable to load more requests. Try again.
        </Text>
      ) : null}
      {nextCursor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: loadingMore }}
          disabled={loadingMore}
          onPress={() => void loadMore()}
          style={({ pressed }) => [
            styles.factButton,
            pressed && !loadingMore && styles.pressed,
            loadingMore && styles.disabled,
          ]}
        >
          <Text style={styles.factButtonText}>
            {loadingMore ? "Loading…" : "Load more requests"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReviewFact({
  entry,
  originalEntryId,
  siteTimeZone,
}: {
  entry: BehaviourEntry;
  originalEntryId: string;
  siteTimeZone: string;
}) {
  return (
    <View style={styles.fact}>
      <Text style={styles.itemTitle}>
        {entry.id === originalEntryId
          ? "Current behaviour fact"
          : "Current corrected fact"}
      </Text>
      <Text style={styles.muted}>
        {entry.visibility === "SENSITIVE" ? "Sensitive" : "General"} ·{" "}
        {entry.category.replaceAll("-", " ")} · {entry.pointsDelta} points ·{" "}
        {formatSiteDateTime(entry.occurredAt, siteTimeZone)}
      </Text>
      <Text style={styles.factText}>{entry.reason}</Text>
      {entry.note ? <Text style={styles.muted}>{entry.note}</Text> : null}
    </View>
  );
}

function isDenied(cause: unknown): boolean {
  const status = toBehaviourApiError(cause).status;
  return status === 401 || status === 403;
}

const styles = StyleSheet.create({
  container: { gap: mobileTokens.spacing.sm },
  heading: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  item: {
    gap: mobileTokens.spacing.xxs,
    borderWidth: 1,
    borderColor: mobileTokens.colors.border.subtle,
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
  },
  itemTitle: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  muted: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  error: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    color: "#B42318",
  },
  factButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    borderRadius: mobileTokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: mobileTokens.spacing.sm,
    marginTop: mobileTokens.spacing.xs,
  },
  factButtonText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  fact: {
    gap: mobileTokens.spacing.xxs,
    borderTopWidth: 1,
    borderTopColor: mobileTokens.colors.border.subtle,
    paddingTop: mobileTokens.spacing.sm,
  },
  factText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
});
