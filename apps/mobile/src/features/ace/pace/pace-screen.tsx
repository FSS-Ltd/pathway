import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandedCard, SectionTitle } from "@/components/primitives/ui";
import { Screen } from "@/components/primitives/screen";
import { mobileTokens } from "@/design/tokens";
import { useAppReady } from "@/hooks/use-app-ready";
import {
  paceDraftStorageKey,
  readPaceDraft,
  resolvePaceDraftScope,
  writePaceDraft,
} from "@/lib/pace-draft-store";
import {
  fetchPaceRoster,
  recordPaceAssessment,
  toPaceApiError,
  type PaceRosterItem,
} from "@/lib/api/pace";
import {
  createPaceSubmissionGate,
  getPacePolicyFeedback,
} from "./pace-policy-feedback";
import { PaceStudentPicker } from "./pace-student-picker";
import {
  PaceSubjectPanel,
  type PaceAssessmentDraft,
} from "./pace-subject-panel";

type StoredPaceDraft = PaceAssessmentDraft & {
  childId: string | null;
  subjectId: string | null;
  assessedAt: string;
  idempotencyKey: string;
};

type Feedback = {
  tone: "success" | "warning" | "block" | "error";
  message: string;
};

export function PaceScreen() {
  const { bootstrapState } = useAppReady();
  const [items, setItems] = useState<PaceRosterItem[]>([]);
  const [draft, setDraft] = useState<StoredPaceDraft>(createEmptyDraft);
  const [hydratedDraftScopeKey, setHydratedDraftScopeKey] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [validation, setValidation] = useState<
    Partial<Record<keyof PaceAssessmentDraft, string>>
  >({});
  const submissionGate = useRef(createPaceSubmissionGate()).current;
  const draftScope = useMemo(
    () =>
      bootstrapState.status === "ready"
        ? resolvePaceDraftScope(
            bootstrapState.state.userId,
            bootstrapState.activeSiteState.activeSiteId,
          )
        : null,
    [bootstrapState],
  );
  const draftScopeKey = draftScope ? paceDraftStorageKey(draftScope) : null;

  const loadRoster = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const roster = await fetchPaceRoster();
      setItems(roster.items);
    } catch (error) {
      const paceError = toPaceApiError(error);
      setLoadError(
        paceError.status === 403
          ? "You do not have access to record PACE assessments for this site."
          : "Unable to load learners right now. Your saved assessment remains on this device.",
      );
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!draftScopeKey) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    void loadRoster();
  }, [draftScopeKey, loadRoster]);

  useEffect(() => {
    let isMounted = true;
    setHydratedDraftScopeKey(null);
    setDraft(createEmptyDraft());
    if (!draftScope || !draftScopeKey) return undefined;

    void readPaceDraft(draftScope)
      .then((value) => {
        if (!isMounted || !value) return;
        const storedDraft = parseStoredDraft(value);
        if (storedDraft) setDraft(storedDraft);
      })
      .finally(() => {
        if (isMounted) setHydratedDraftScopeKey(draftScopeKey);
      });

    return () => {
      isMounted = false;
    };
  }, [draftScope, draftScopeKey]);

  useEffect(() => {
    if (
      !draftScope ||
      !draftScopeKey ||
      hydratedDraftScopeKey !== draftScopeKey
    )
      return;
    void writePaceDraft(draftScope, JSON.stringify(draft)).catch(
      () => undefined,
    );
  }, [draft, draftScope, draftScopeKey, hydratedDraftScopeKey]);

  const subjects = useMemo(
    () => items.filter((item) => item.child.id === draft.childId),
    [draft.childId, items],
  );
  const selectedSubject = useMemo(
    () => subjects.find((item) => item.subject.id === draft.subjectId) ?? null,
    [draft.subjectId, subjects],
  );
  const isReady =
    !isLoading &&
    hydratedDraftScopeKey === draftScopeKey &&
    Boolean(draftScopeKey);

  const selectStudent = (childId: string) => {
    setFeedback(null);
    setValidation({});
    setDraft((current) => ({
      ...current,
      childId,
      subjectId: null,
    }));
  };

  const selectSubject = (item: PaceRosterItem) => {
    setFeedback(null);
    setValidation({});
    setDraft({
      ...createEmptyDraft(),
      childId: item.child.id,
      subjectId: item.subject.id,
      paceNumber: String(item.currentPace),
    });
  };

  const updateDraft = (field: keyof PaceAssessmentDraft, value: string) => {
    setValidation((current) => ({ ...current, [field]: undefined }));
    setFeedback(null);
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const submit = () => {
    const errors = validateDraft(draft, selectedSubject);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || !selectedSubject) return;

    void submissionGate.run(async () => {
      setIsSubmitting(true);
      setFeedback(null);
      try {
        const response = await recordPaceAssessment({
          idempotencyKey: draft.idempotencyKey,
          childId: selectedSubject.child.id,
          subjectId: selectedSubject.subject.id,
          paceNumber: Number(draft.paceNumber),
          assessmentType: draft.assessmentType,
          score: Number(draft.score),
          assessedAt: draft.assessedAt,
          reason: draft.reason.trim(),
        });
        const policyFeedback = policyFeedbackFromResponse(response.policy);
        setFeedback(
          policyFeedback
            ? policyFeedback
            : {
                tone: "success",
                message: response.duplicate
                  ? "This assessment was already recorded."
                  : "Assessment recorded.",
              },
        );
        setDraft({
          ...createEmptyDraft(),
          childId: selectedSubject.child.id,
          subjectId: selectedSubject.subject.id,
          paceNumber: String(response.progress.currentPace),
        });
      } catch (error) {
        const paceError = toPaceApiError(error);
        setFeedback(
          paceError.policyCode
            ? getPacePolicyFeedback({
                decision: "block",
                code: paceError.policyCode,
              })
            : { tone: "error", message: paceError.message },
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <Screen
      tone="serve"
      badge="Serve Space"
      title="PACE assessments"
      subtitle="Choose a learner, record one assessment, and let site policy decide the outcome."
    >
      <BrandedCard>
        <SectionTitle
          title="1. Choose learner"
          subtitle="Only learners with active subject placements are shown."
        />
        {!isReady ? (
          <Text style={styles.stateText}>
            Loading learners and saved draft…
          </Text>
        ) : null}
        {loadError ? (
          <View style={styles.errorState} accessibilityRole="alert">
            <Text style={styles.stateText}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadRoster()}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {isReady && !loadError && items.length === 0 ? (
          <Text style={styles.stateText}>
            No learners have an active PACE placement yet.
          </Text>
        ) : null}
        {isReady && items.length > 0 ? (
          <PaceStudentPicker
            disabled={isSubmitting}
            items={items}
            onSelect={selectStudent}
            selectedChildId={draft.childId}
          />
        ) : null}
      </BrandedCard>

      {draft.childId && isReady && !loadError ? (
        <BrandedCard>
          <SectionTitle
            title="2. Choose subject and record"
            subtitle="PACE eligibility and progression are confirmed by the server."
          />
          <PaceSubjectPanel
            disabled={isSubmitting}
            draft={draft}
            items={subjects}
            onChange={updateDraft}
            onSelectSubject={selectSubject}
            onSubmit={submit}
            selectedSubjectId={draft.subjectId}
            validation={validation}
          />
          {feedback ? <FeedbackCallout feedback={feedback} /> : null}
        </BrandedCard>
      ) : null}
    </Screen>
  );
}

function FeedbackCallout({ feedback }: { feedback: Feedback }) {
  const isBlock = feedback.tone === "block" || feedback.tone === "error";
  return (
    <View
      accessibilityRole={isBlock ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[
        styles.feedback,
        isBlock
          ? styles.blockFeedback
          : feedback.tone === "warning"
            ? styles.warningFeedback
            : styles.successFeedback,
      ]}
    >
      <Text style={styles.feedbackTitle}>
        {feedback.tone === "success"
          ? "Recorded"
          : feedback.tone === "warning"
            ? "Policy warning"
            : feedback.tone === "error"
              ? "Unable to record"
              : "Blocked by policy"}
      </Text>
      <Text style={styles.feedbackText}>{feedback.message}</Text>
    </View>
  );
}

function createEmptyDraft(): StoredPaceDraft {
  return {
    childId: null,
    subjectId: null,
    paceNumber: "",
    assessmentType: "FinalTest",
    score: "",
    assessedAt: new Date().toISOString(),
    reason: "",
    idempotencyKey: createIdempotencyKey(),
  };
}

function policyFeedbackFromResponse(
  policy:
    | {
        decision: "allow" | "warn" | "block";
        code: Parameters<typeof getPacePolicyFeedback>[0]["code"];
      }
    | undefined,
): ReturnType<typeof getPacePolicyFeedback> | null {
  if (!policy) return null;
  if (policy.decision === "warn") {
    return getPacePolicyFeedback({ decision: "warn", code: policy.code });
  }
  if (policy.decision === "block") {
    return getPacePolicyFeedback({ decision: "block", code: policy.code });
  }
  return null;
}

function createIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `pace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateDraft(
  draft: StoredPaceDraft,
  selectedSubject: PaceRosterItem | null,
): Partial<Record<keyof PaceAssessmentDraft, string>> {
  const errors: Partial<Record<keyof PaceAssessmentDraft, string>> = {};
  if (!selectedSubject) errors.assessmentType = "Choose a subject first.";
  if (!isPositiveInteger(draft.paceNumber))
    errors.paceNumber = "Use a whole PACE number greater than zero.";
  if (!isScore(draft.score)) errors.score = "Use a whole score from 0 to 100.";
  if (!draft.reason.trim())
    errors.reason = "Add a brief reason for this assessment.";
  return errors;
}

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function isScore(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 100;
}

function parseStoredDraft(value: string): StoredPaceDraft | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isStoredPaceDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isStoredPaceDraft(value: unknown): value is StoredPaceDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    (typeof draft.childId === "string" || draft.childId === null) &&
    (typeof draft.subjectId === "string" || draft.subjectId === null) &&
    typeof draft.paceNumber === "string" &&
    (draft.assessmentType === "SelfTest" ||
      draft.assessmentType === "FinalTest") &&
    typeof draft.score === "string" &&
    typeof draft.assessedAt === "string" &&
    typeof draft.reason === "string" &&
    typeof draft.idempotencyKey === "string"
  );
}

const styles = StyleSheet.create({
  stateText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.muted,
  },
  errorState: {
    gap: mobileTokens.spacing.sm,
  },
  retryButton: {
    minHeight: 48,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileTokens.radius.md,
    borderWidth: 1,
    borderColor: mobileTokens.colors.accent.serve,
    paddingHorizontal: mobileTokens.spacing.md,
  },
  retryText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontWeight: mobileTokens.typography.weight.semibold,
    fontSize: mobileTokens.typography.body.md.size,
    color: mobileTokens.colors.text.primary,
  },
  feedback: {
    gap: mobileTokens.spacing.xxxs,
    borderRadius: mobileTokens.radius.md,
    borderWidth: 1,
    padding: mobileTokens.spacing.sm,
  },
  successFeedback: {
    borderColor: "#B7D9BE",
    backgroundColor: "#F2F8F6",
  },
  warningFeedback: {
    borderColor: "#F2D38C",
    backgroundColor: "#FFF9E8",
  },
  blockFeedback: {
    borderColor: "#F4C7C3",
    backgroundColor: "#FFF4F2",
  },
  feedbackTitle: {
    fontFamily: mobileTokens.typography.fontFamily.heading,
    fontWeight: mobileTokens.typography.weight.bold,
    fontSize: mobileTokens.typography.body.md.size,
    lineHeight: mobileTokens.typography.body.md.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
  feedbackText: {
    fontFamily: mobileTokens.typography.fontFamily.body,
    fontSize: mobileTokens.typography.body.sm.size,
    lineHeight: mobileTokens.typography.body.sm.lineHeight,
    color: mobileTokens.colors.text.primary,
  },
});
