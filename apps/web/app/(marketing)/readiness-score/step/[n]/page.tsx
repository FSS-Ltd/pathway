"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { track } from "../../../../../lib/analytics";
import { getFirstTouchAttribution } from "../../../../../lib/attribution";
import PageWrapper from "../../../../../components/page-wrapper";
import { QuizProgress } from "../../../../../components/readiness-quiz/quiz-progress";
import { QuizHelperPanel } from "../../../../../components/readiness-quiz/quiz-helper-panel";
import { QuizQuestionCard } from "../../../../../components/readiness-quiz/quiz-question-card";
import {
  QUIZ_STORAGE_KEY,
  getQuestionAt,
  getTotalSteps,
  type QuizAnswers,
} from "../../../../../lib/readiness-quiz";

function loadAnswers(): QuizAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QuizAnswers;
    return typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAnswers(answers: QuizAnswers) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // ignore
  }
}

export default function ReadinessScoreStepPage() {
  const params = useParams();
  const router = useRouter();
  const n = Number(params.n);

  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [mounted, setMounted] = useState(false);

  const totalSteps = getTotalSteps();
  const question = getQuestionAt(n - 1);

  useEffect(() => {
    setAnswers(loadAnswers());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && question) {
      const attribution = getFirstTouchAttribution();
      track({
        type: "readiness_step_view",
        step: n,
        total: totalSteps,
        utm: attribution?.utm,
      });
    }
  }, [mounted, question, n, totalSteps]);

  const saveAndNavigate = useCallback(
    (nextStep: number) => {
      saveAnswers(answers);
      if (nextStep > totalSteps) {
        router.push("/readiness-score/results");
      } else {
        router.push(`/readiness-score/step/${nextStep}`);
      }
    },
    [answers, totalSteps, router]
  );

  const handleChange = useCallback((value: string | number | undefined) => {
    if (question) {
      setAnswers((prev) => {
        const next = { ...prev };
        if (value === undefined) {
          delete next[question.id];
        } else {
          next[question.id] = value;
        }
        return next;
      });
    }
  }, [question]);

  const handleContinue = useCallback(() => {
    if (!question) return;

    const val = answers[question.id];
    if (question.type === "numeric") {
      const num = Number(val);
      const min = question.validation.min;
      const max = question.validation.max;
      if (Number.isNaN(num) || num < min || num > max) return;
    }

    saveAndNavigate(n + 1);
  }, [question, answers, n, saveAndNavigate]);

  const handleBack = useCallback(() => {
    saveAndNavigate(n - 1);
  }, [n, saveAndNavigate]);

  if (!mounted) {
    return (
      <PageWrapper>
        <div className="mx-auto max-w-[1120px] px-4 py-12">
          <div className="animate-pulse rounded-xl bg-muted p-8">Loading...</div>
        </div>
      </PageWrapper>
    );
  }

  if (n < 1 || n > totalSteps) {
    if (n > totalSteps) {
      router.replace("/readiness-score/results");
      return null;
    }
    return (
      <PageWrapper>
        <div className="mx-auto max-w-[1120px] px-4 py-12">
          <div className="text-center">
            <p className="text-text-muted">Invalid step.</p>
            <Link href="/readiness-score" className="mt-4 inline-block text-accent-primary">
              Back to start
            </Link>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!question) {
    return (
      <PageWrapper>
        <div className="mx-auto max-w-[1120px] px-4 py-12">
          <div className="text-center">
            <p className="text-text-muted">Invalid step.</p>
            <Link href="/readiness-score" className="mt-4 inline-block text-accent-primary">
              Back to start
            </Link>
          </div>
        </div>
      </PageWrapper>
    );
  }

  const currentValue = answers[question.id];
  const displayValue: string | number | undefined =
    question.type === "numeric" && currentValue === undefined
      ? undefined
      : Array.isArray(currentValue)
        ? undefined
        : (currentValue as string | number | undefined);

  return (
    <PageWrapper>
      <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12 md:px-8 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="mb-6">
              <QuizProgress current={n} total={totalSteps} />
            </div>

            <motion.div
              key={question.id}
              initial={{ opacity: 1, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <QuizQuestionCard
                question={question}
                value={displayValue}
                onChange={handleChange}
                onContinue={handleContinue}
                onBack={handleBack}
                canGoBack={n > 1}
              />
            </motion.div>

            <div className="mt-6 lg:hidden">
              <QuizHelperPanel category={question.category} />
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <QuizHelperPanel category={question.category} />
            </div>
          </aside>
        </div>

        <div className="mt-8 flex justify-center md:hidden">
          <Link
            href="/readiness-score"
            className="text-sm text-text-muted hover:text-accent-primary"
          >
            Start over
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
