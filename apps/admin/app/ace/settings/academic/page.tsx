"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import {
  createAcademicYear,
  fetchAcademicCalendar,
  type AdminAcademicCalendar,
  type CreateAdminAcademicYearInput,
} from "@/lib/api-client";
import { hasPermission } from "@/lib/access";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";
import { AcademicCalendarForm } from "./academic-calendar-form";

export default function AcademicCalendarPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasPermission(permissions, "ace.settings.read");
  const canManage = hasPermission(permissions, "ace.settings.manage");
  const [calendar, setCalendar] = React.useState<AdminAcademicCalendar | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setCalendar(await fetchAcademicCalendar());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load the academic calendar.",
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
    )
      return;
    void load();
  }, [canRead, isLoadingAccess, load, session, sessionStatus]);

  const save = async (input: CreateAdminAcademicYearInput) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createAcademicYear(input);
      setCalendar((current) =>
        current
          ? { ...current, academicYears: [created, ...current.academicYears] }
          : current,
      );
      setSuccess("Academic year saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save the academic year.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingAccess) return null;
  if (!canRead) {
    return (
      <NoAccessCard
        title="Academic calendar"
        message="You do not have permission to view ACE settings."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Academic calendar
        </h1>
        <p className="text-sm text-text-muted">
          Set the academic year before placing students in subjects.
        </p>
      </div>
      <AcademicCalendarForm
        isLoading={isLoading}
        academicYears={calendar?.academicYears ?? []}
        isSaving={isSaving}
        error={error}
        success={success}
        canManage={canManage}
        timezone={calendar?.timezone ?? null}
        onSave={save}
      />
    </div>
  );
}
