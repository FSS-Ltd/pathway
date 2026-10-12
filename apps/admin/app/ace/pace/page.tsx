"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import {
  correctPaceAssessment,
  createPaceAssessment,
  createPacePolicyOverride,
  fetchPaceExceptions,
  fetchPaceRoster,
  type AdminPaceCorrectionInput,
  type AdminPaceExceptionItem,
  type AdminPaceRosterItem,
  type AdminPaceAssessmentInput,
  type AdminPacePolicyOverrideInput,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";
import { PaceCorrectionDialog } from "@/components/ace/pace/pace-correction-dialog";
import { PaceEntryDialog } from "@/components/ace/pace/pace-entry-dialog";
import {
  fetchAllPacePages,
  PaceRoster,
} from "@/components/ace/pace/pace-roster";

type CorrectionTarget = {
  assessmentId: string;
  rosterItem: AdminPaceRosterItem;
};

export default function PacePage() {
  const {
    data: session,
    status: sessionStatus,
    update: refreshSession,
  } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasPermission(permissions, "ace.pace.read");
  const canRecord = hasPermission(permissions, "ace.pace.record");
  const canCorrect = hasPermission(permissions, "ace.pace.correct");
  const canReadDiagnostics =
    permissions?.includes("ace.pace.diagnostics.read") === true;
  const canOverride = hasPermission(permissions, "ace.pace.override");
  const [roster, setRoster] = React.useState<AdminPaceRosterItem[]>([]);
  const [exceptions, setExceptions] = React.useState<AdminPaceExceptionItem[]>(
    [],
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [entryTarget, setEntryTarget] =
    React.useState<AdminPaceRosterItem | null>(null);
  const [correctionTarget, setCorrectionTarget] =
    React.useState<CorrectionTarget | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextRoster, nextExceptions] = await Promise.all([
        fetchAllPacePages(fetchPaceRoster),
        fetchAllPacePages(fetchPaceExceptions),
      ]);
      setRoster(nextRoster);
      setExceptions(nextExceptions);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load the PACE workflow.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session ||
      isLoadingAccess ||
      !canRead
    ) {
      return;
    }
    void load();
  }, [canRead, isLoadingAccess, load, session, sessionStatus]);

  const afterCommand = async () => {
    await load();
  };

  if (isLoadingAccess) return null;
  if (!canRead) {
    return (
      <NoAccessCard
        title="PACE workflow"
        message="You do not have permission to view ACE PACE progress."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          PACE workflow
        </h1>
        <p className="text-sm text-text-muted">
          Record PACE assessments, review exceptions, and correct records with a
          clear audit trail.
        </p>
      </div>
      <PaceRoster
        isLoading={isLoading}
        items={roster}
        exceptions={exceptions}
        error={error}
        canRecord={canRecord}
        canCorrect={canCorrect}
        canReadDiagnostics={canReadDiagnostics}
        onRecord={setEntryTarget}
        onCorrect={(assessmentId, rosterItem) =>
          setCorrectionTarget({ assessmentId, rosterItem })
        }
        onRetry={() => void load()}
      />
      <PaceEntryDialog
        isOpen={entryTarget !== null}
        rosterItem={entryTarget}
        canOverride={canOverride}
        onClose={() => setEntryTarget(null)}
        onSave={(input: AdminPaceAssessmentInput) =>
          createPaceAssessment(input)
        }
        onAuthoriseOverride={(input: AdminPacePolicyOverrideInput) =>
          createPacePolicyOverride(input)
        }
        onSuccess={afterCommand}
        onRefreshStepUp={refreshSession}
      />
      <PaceCorrectionDialog
        isOpen={correctionTarget !== null}
        assessmentId={correctionTarget?.assessmentId ?? null}
        rosterItem={correctionTarget?.rosterItem ?? null}
        onClose={() => setCorrectionTarget(null)}
        onSave={(input: AdminPaceCorrectionInput) => {
          if (!correctionTarget) {
            return Promise.reject(
              new Error("Select an assessment to correct."),
            );
          }
          return correctPaceAssessment(correctionTarget.assessmentId, input);
        }}
        onSuccess={afterCommand}
      />
    </div>
  );
}
