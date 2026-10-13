"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@pathway/ui";
import {
  createStudentSubject,
  endStudentSubject,
  fetchStudentSubjects,
  type AdminStudentSubjects,
  type AdminStudentSubjectPlacement,
  type CreateAdminStudentSubjectInput,
  type EndAdminStudentSubjectInput,
} from "@/lib/api-client";
import { SubjectPlacementForm } from "@/components/ace/pace/subject-placement-form";
import { EndSubjectPlacementDialog } from "./end-subject-placement-dialog";

export function ChildPaceSection({
  childId,
  canRecord,
}: {
  childId: string;
  canRecord: boolean;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<AdminStudentSubjects | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [ending, setEnding] =
    React.useState<AdminStudentSubjectPlacement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchStudentSubjects(childId));
      return true;
    } catch (cause) {
      setData(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load subject placements.",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [childId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: CreateAdminStudentSubjectInput) => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createStudentSubject(childId, input);
      const refreshed = await load();
      router.refresh();
      if (refreshed) setSuccess("Subject placement saved.");
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

  const close = () => {
    setEnding(null);
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected
        ? opener.current
        : heading.current;
      target?.focus();
    });
  };

  const end = async (input: EndAdminStudentSubjectInput) => {
    if (!ending) return;
    await endStudentSubject(childId, ending.id, input);
    setSuccess(null);
    const refreshed = await load();
    router.refresh();
    if (refreshed)
      setSuccess(
        "Subject unassigned. Its assessments remain in the student history.",
      );
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-heading text-xl font-semibold text-text-primary"
        >
          Subjects & PACEs
        </h2>
        <p className="text-sm text-text-muted">
          Assign an active subject, revise its PACE placement, or end an
          assignment.
        </p>
      </div>
      {!isLoading && !data ? (
        <Card title="Subject placements">
          <p role="alert" className="text-sm text-status-danger">
            {error ?? "Unable to load subject placements."}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </Card>
      ) : (
        <SubjectPlacementForm
          isLoading={isLoading}
          placements={data?.placements ?? []}
          subjects={data?.subjects ?? []}
          isSaving={isSaving}
          error={error}
          success={success}
          canRecord={canRecord}
          onSave={save}
          onEnd={(placement) => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            setEnding(placement);
          }}
        />
      )}
      {ending ? (
        <EndSubjectPlacementDialog
          placement={ending}
          onClose={close}
          onSave={end}
        />
      ) : null}
    </div>
  );
}
