"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import {
  createStudentSubject,
  fetchStudentSubjects,
  type AdminStudentSubjects,
  type CreateAdminStudentSubjectInput,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";
import { SubjectPlacementForm } from "./subject-placement-form";

export default function StudentSubjectsPage({
  params,
}: {
  params: { childId: string };
}) {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasPermission(permissions, "ace.pace.read");
  const canRecord = hasPermission(permissions, "ace.pace.record");
  const [data, setData] = React.useState<AdminStudentSubjects | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchStudentSubjects(params.childId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load subject placements.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [params.childId]);

  React.useEffect(() => {
    if (
      sessionStatus !== "authenticated" ||
      !session ||
      isLoadingAccess ||
      !canRead
    )
      return;
    void load();
  }, [canRead, isLoadingAccess, load, session, sessionStatus]);

  const save = async (input: CreateAdminStudentSubjectInput) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const placement = await createStudentSubject(params.childId, input);
      setData((current) =>
        current
          ? { ...current, placements: [...current.placements, placement] }
          : current,
      );
      setSuccess("Subject placement saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the subject placement.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAccess) return null;
  if (!canRead)
    return (
      <NoAccessCard
        title="Subject placement"
        message="You do not have permission to view ACE subject placements."
      />
    );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Subject placement
        </h1>
        <p className="text-sm text-text-muted">
          Set a student’s initial subject PACE or record a revised placement.
        </p>
      </div>
      <SubjectPlacementForm
        isLoading={isLoading}
        placements={data?.placements ?? []}
        subjects={data?.subjects ?? []}
        isSaving={isSaving}
        error={error}
        success={success}
        canRecord={canRecord}
        onSave={save}
      />
    </div>
  );
}
