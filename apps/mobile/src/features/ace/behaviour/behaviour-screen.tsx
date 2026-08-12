import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandedCard, SectionTitle } from "@/components/primitives/ui";
import { Screen } from "@/components/primitives/screen";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import {
  activateAndReadBehaviourDraft,
  behaviourDraftStorageKey,
  resolveBehaviourDraftScope,
  writeBehaviourDraft,
} from "@/lib/behaviour-draft-store";
import {
  correctBehaviour,
  fetchBehaviourChildren,
  fetchBehaviourHistory,
  fetchBehaviourPermissions,
  fetchBehaviourPolicy,
  recordBehaviour,
  toBehaviourApiError,
  type BehaviourCategory,
  type BehaviourChild,
  type BehaviourEntry,
  type BehaviourVisibility,
} from "@/lib/api/behaviour";
import {
  BehaviourCaptureForm,
  type BehaviourDraft,
  type BehaviourDraftValidation,
} from "./behaviour-capture-form";
import { BehaviourHistoryList } from "./behaviour-history-list";

type Feedback = { tone: "success" | "error"; message: string };

export function BehaviourScreen() {
  const { bootstrapState } = useAppReady();
  const [children, setChildren] = useState<BehaviourChild[]>([]);
  const [categories, setCategories] = useState<BehaviourCategory[]>([]);
  const [history, setHistory] = useState<BehaviourEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [draft, setDraft] = useState<BehaviourDraft>(createEmptyDraft);
  const [visibility, setVisibility] = useState<BehaviourVisibility>("GENERAL");
  const [validation, setValidation] = useState<BehaviourDraftValidation>({});
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const [isDraftSanitised, setIsDraftSanitised] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const submitting = useRef(false);
  const userId =
    bootstrapState.status === "ready" ? bootstrapState.state.userId : undefined;
  const siteId =
    bootstrapState.status === "ready"
      ? bootstrapState.activeSiteState.activeSiteId
      : null;
  const draftScope = useMemo(
    () => resolveBehaviourDraftScope(userId, siteId),
    [siteId, userId],
  );
  const draftScopeKey = draftScope
    ? behaviourDraftStorageKey(draftScope)
    : null;
  const canRead = permissions.includes("ace.behaviour.read");
  const canRecord = permissions.includes("ace.behaviour.record");
  const canSensitive = permissions.includes("ace.behaviour.sensitive.read");

  const load = useCallback(async () => {
    setIsLoading(true);
    setIsDraftSanitised(false);
    setLoadError(null);
    try {
      const [access, nextChildren, policy, nextHistory] = await Promise.all([
        fetchBehaviourPermissions(),
        fetchBehaviourChildren(),
        fetchBehaviourPolicy(),
        fetchBehaviourHistory({ limit: 50 }),
      ]);
      if (!access.permissions.includes("ace.behaviour.read")) {
        throw new Error(
          "You do not have access to behaviour records for this site.",
        );
      }
      const sensitive = access.permissions.includes(
        "ace.behaviour.sensitive.read",
      );
      setPermissions(access.permissions);
      setChildren(nextChildren);
      setCategories(policy.categories);
      setHistory(
        nextHistory.items.filter(
          (item) => item.visibility === "GENERAL" || sensitive,
        ),
      );
      setDraft((current) =>
        sanitiseDraft(current, policy.categories, sensitive),
      );
      if (!sensitive) setVisibility("GENERAL");
    } catch (cause) {
      const apiError = toBehaviourApiError(cause);
      setPermissions([]);
      setChildren([]);
      setCategories([]);
      setHistory([]);
      setLoadError(apiError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!draftScopeKey) {
      setIsLoading(false);
      return;
    }
    void load();
  }, [draftScopeKey, load]);

  useEffect(() => {
    let mounted = true;
    setHydratedScopeKey(null);
    setIsDraftSanitised(false);
    setDraft(createEmptyDraft());
    setVisibility("GENERAL");
    if (!draftScope || !draftScopeKey) return undefined;
    void activateAndReadBehaviourDraft(draftScope)
      .then((value) => {
        if (!mounted || !value) return;
        const stored = parseDraft(value);
        if (stored) setDraft(stored);
      })
      .finally(() => {
        if (mounted) setHydratedScopeKey(draftScopeKey);
      });
    return () => {
      mounted = false;
    };
  }, [draftScope, draftScopeKey]);

  useEffect(() => {
    if (
      !draftScope ||
      !draftScopeKey ||
      hydratedScopeKey !== draftScopeKey ||
      isLoading ||
      loadError
    ) {
      return;
    }
    const safeDraft = sanitiseDraft(draft, categories, canSensitive);
    if (safeDraft !== draft) {
      setDraft(safeDraft);
      setIsDraftSanitised(true);
      return;
    }
    setIsDraftSanitised(true);
    void writeBehaviourDraft(draftScope, JSON.stringify(safeDraft)).catch(
      () => undefined,
    );
  }, [
    canSensitive,
    categories,
    draft,
    draftScope,
    draftScopeKey,
    hydratedScopeKey,
    isLoading,
    loadError,
  ]);

  const updateDraft = (field: keyof BehaviourDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (
      field === "childId" ||
      field === "category" ||
      field === "pointsDelta" ||
      field === "reason"
    ) {
      setValidation((current) => ({ ...current, [field]: undefined }));
    }
    setFeedback(null);
  };

  const selectChild = (childId: string) => {
    updateDraft("childId", childId);
  };

  const selectCategory = (category: BehaviourCategory) => {
    if (!isCategoryAvailable(category, canSensitive)) return;
    setDraft((current) => ({
      ...current,
      category: category.code,
      pointsDelta: defaultPoints(category.type),
    }));
    setValidation((current) => ({
      ...current,
      category: undefined,
      pointsDelta: undefined,
    }));
    setFeedback(null);
  };

  const selectVisibility = (next: BehaviourVisibility) => {
    if (next === "SENSITIVE" && !canSensitive) return;
    setVisibility(next);
    setDraft((current) => ({ ...current, category: null, pointsDelta: "" }));
    setValidation((current) => ({
      ...current,
      category: undefined,
      pointsDelta: undefined,
    }));
    setFeedback(null);
  };

  const submit = () => {
    if (submitting.current || !canRecord) return;
    const category = categories.find(
      (candidate) =>
        candidate.code === draft.category &&
        candidate.visibility === visibility &&
        isCategoryAvailable(candidate, canSensitive),
    );
    const errors = validateDraft(draft, category);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || !category || !draft.childId) return;

    submitting.current = true;
    setIsSubmitting(true);
    setFeedback(null);
    const note = draft.note.trim();
    void recordBehaviour({
      idempotencyKey: draft.idempotencyKey,
      childId: draft.childId,
      category: category.code,
      type: category.type,
      visibility: category.visibility,
      pointsDelta: Number(draft.pointsDelta),
      occurredAt: new Date(draft.occurredAt).toISOString(),
      reason: draft.reason.trim(),
      ...(note ? { note } : {}),
    })
      .then(async (response) => {
        setFeedback({
          tone: "success",
          message: response.duplicate
            ? "This behaviour was already recorded."
            : "Behaviour recorded.",
        });
        setDraft((current) => ({
          ...createEmptyDraft(),
          childId: current.childId,
        }));
        await load();
      })
      .catch((cause: unknown) => {
        setFeedback({
          tone: "error",
          message: toBehaviourApiError(cause).message,
        });
      })
      .finally(() => {
        submitting.current = false;
        setIsSubmitting(false);
      });
  };

  const ready =
    hydratedScopeKey === draftScopeKey &&
    Boolean(draftScopeKey) &&
    isDraftSanitised;

  return (
    <Screen
      tone="serve"
      badge="Serve Space"
      title="Behaviour capture"
      subtitle="Record one observed behaviour using active site categories. The server applies policy and escalation."
    >
      {isLoading || !ready ? (
        <BrandedCard>
          <Text style={styles.stateText}>Loading behaviour capture…</Text>
        </BrandedCard>
      ) : null}

      {!isLoading && loadError ? (
        <BrandedCard>
          <View accessibilityRole="alert" style={styles.errorState}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        </BrandedCard>
      ) : null}

      {!isLoading && ready && canRead && !loadError ? (
        <>
          {canRecord ? (
            <BrandedCard>
              <SectionTitle
                title="New record"
                subtitle="Sensitive mode appears only after current server authorisation."
              />
              <BehaviourCaptureForm
                children={children}
                categories={categories}
                canSensitive={canSensitive}
                disabled={isSubmitting}
                draft={draft}
                validation={validation}
                visibility={visibility}
                onChange={updateDraft}
                onSelectChild={selectChild}
                onSelectCategory={selectCategory}
                onSelectVisibility={selectVisibility}
                onSubmit={submit}
              />
              {feedback ? <FeedbackCallout feedback={feedback} /> : null}
            </BrandedCard>
          ) : null}

          <BrandedCard>
            <SectionTitle
              title="Behaviour history"
              subtitle="Current records are shown newest first."
            />
            <BehaviourHistoryList
              items={history}
              children={children}
              canCorrect={canRecord}
              disabled={isSubmitting}
              onCorrect={correctBehaviour}
              onSuccess={async () => {
                setFeedback({
                  tone: "success",
                  message: "Correction recorded.",
                });
                await load();
              }}
            />
          </BrandedCard>
        </>
      ) : null}
    </Screen>
  );
}

function FeedbackCallout({ feedback }: { feedback: Feedback }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={feedback.tone === "error" ? "alert" : undefined}
      style={[
        styles.feedback,
        feedback.tone === "error"
          ? styles.errorFeedback
          : styles.successFeedback,
      ]}
    >
      <Text style={styles.feedbackText}>{feedback.message}</Text>
    </View>
  );
}

function createEmptyDraft(): BehaviourDraft {
  return {
    childId: null,
    category: null,
    pointsDelta: "",
    occurredAt: new Date().toISOString(),
    reason: "",
    note: "",
    idempotencyKey: createCommandKey(),
  };
}

function parseDraft(value: string): BehaviourDraft | null {
  try {
    const parsed = JSON.parse(value) as Partial<BehaviourDraft>;
    if (
      (parsed.childId !== null && typeof parsed.childId !== "string") ||
      (parsed.category !== null && typeof parsed.category !== "string") ||
      typeof parsed.pointsDelta !== "string" ||
      typeof parsed.occurredAt !== "string" ||
      Number.isNaN(Date.parse(parsed.occurredAt)) ||
      typeof parsed.reason !== "string" ||
      typeof parsed.note !== "string" ||
      typeof parsed.idempotencyKey !== "string"
    ) {
      return null;
    }
    return parsed as BehaviourDraft;
  } catch {
    return null;
  }
}

function sanitiseDraft(
  draft: BehaviourDraft,
  categories: BehaviourCategory[],
  canSensitive: boolean,
): BehaviourDraft {
  const category = categories.find(
    (candidate) => candidate.code === draft.category,
  );
  if (!category && draft.category && !canSensitive) {
    return {
      ...draft,
      category: null,
      pointsDelta: "",
      reason: "",
      note: "",
      idempotencyKey: createCommandKey(),
    };
  }
  if (category?.visibility === "SENSITIVE" && !canSensitive) {
    return {
      ...draft,
      category: null,
      pointsDelta: "",
      reason: "",
      note: "",
      idempotencyKey: createCommandKey(),
    };
  }
  if (!category || !isCategoryAvailable(category, canSensitive)) {
    if (draft.category === null && draft.pointsDelta === "") return draft;
    return { ...draft, category: null, pointsDelta: "" };
  }
  return draft;
}

function isCategoryAvailable(
  category: BehaviourCategory,
  canSensitive: boolean,
): boolean {
  return (
    category.isActive && (category.visibility === "GENERAL" || canSensitive)
  );
}

function validateDraft(
  draft: BehaviourDraft,
  category: BehaviourCategory | undefined,
): BehaviourDraftValidation {
  const errors: BehaviourDraftValidation = {};
  if (!draft.childId) errors.childId = "Choose a learner.";
  if (!category) errors.category = "Choose an active category.";
  const points = Number(draft.pointsDelta);
  if (!Number.isInteger(points)) {
    errors.pointsDelta = "Enter a whole number of points.";
  } else if (
    category &&
    ((category.type === "MERIT" && points <= 0) ||
      (category.type === "DEMERIT" && points >= 0) ||
      (category.type === "GENERAL" && points !== 0))
  ) {
    errors.pointsDelta = "Points do not match this category type.";
  }
  if (!draft.reason.trim()) errors.reason = "Enter a reason.";
  return errors;
}

function defaultPoints(type: BehaviourCategory["type"]): string {
  if (type === "MERIT") return "1";
  if (type === "DEMERIT") return "-1";
  return "0";
}

function createCommandKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `behaviour-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const styles = StyleSheet.create({
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  errorState: { gap: mobileTokens.spacing.sm },
  errorText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: "#B42318",
  },
  retryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    borderRadius: mobileTokens.radius.md,
  },
  retryText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  feedback: {
    borderRadius: mobileTokens.radius.md,
    padding: mobileTokens.spacing.sm,
  },
  successFeedback: { backgroundColor: "#ECFDF3" },
  errorFeedback: { backgroundColor: "#FEF3F2" },
  feedbackText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
});
