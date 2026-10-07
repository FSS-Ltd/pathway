"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
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
import { PacePolicySettings } from "./pace-policy-settings";
import { SubjectSettings } from "./subject-settings";

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
  const [siteRevision, setSiteRevision] = React.useState(0);
  const siteGeneration = React.useRef(0);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        siteGeneration.current += 1;
        setSiteRevision((current) => current + 1);
        setCalendar(null);
        setError(null);
        setSuccess(null);
        setIsLoading(true);
        setIsSaving(false);
      }),
    [],
  );

  const load = React.useCallback(async (generation: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await fetchAcademicCalendar();
      if (generation === siteGeneration.current) setCalendar(loaded);
    } catch (cause) {
      if (generation === siteGeneration.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load the academic calendar.",
        );
      }
    } finally {
      if (generation === siteGeneration.current) setIsLoading(false);
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
    const generation = siteGeneration.current;
    void load(generation);
    return () => {
      siteGeneration.current += 1;
    };
  }, [canRead, isLoadingAccess, load, session, sessionStatus, siteRevision]);

  const save = async (input: CreateAdminAcademicYearInput) => {
    const generation = siteGeneration.current;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createAcademicYear(input);
      if (generation !== siteGeneration.current) return;
      setCalendar((current) =>
        current
          ? { ...current, academicYears: [created, ...current.academicYears] }
          : current,
      );
      setSuccess("Academic year saved.");
    } catch (cause) {
      if (generation === siteGeneration.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to save the academic year.",
        );
      }
    } finally {
      if (generation === siteGeneration.current) setIsSaving(false);
    }
  };

  if (isLoadingAccess) return null;
  if (!canRead) {
    return (
      <NoAccessCard
        title="Academic setup"
        message="You do not have permission to view ACE settings."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Academic setup
        </h1>
        <p className="text-sm text-text-muted">
          Set the academic year, subjects, and PACE assessment rules for the
          active site.
        </p>
      </div>
      <AcademicCalendarForm
        key={siteRevision}
        isLoading={isLoading}
        academicYears={calendar?.academicYears ?? []}
        isSaving={isSaving}
        error={error}
        success={success}
        canManage={canManage}
        timezone={calendar?.timezone ?? null}
        onSave={save}
      />
      <SubjectSettings canManage={canManage} />
      <PacePolicySettings canManage={canManage} />
    </div>
  );
}
