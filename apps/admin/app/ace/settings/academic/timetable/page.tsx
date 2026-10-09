"use client";

import { NoAccessCard } from "@/components/no-access-card";
import { HeadSubjectTimetableWorkspace } from "@/components/ace/timetable/head-subject-timetable-workspace";
import { hasPermission } from "@/lib/access";
import { useAdminAccess } from "@/lib/use-admin-access";

export default function SubjectTimetableSettingsPage() {
  const { permissions, isLoading } = useAdminAccess();
  if (isLoading) return null;
  if (!hasPermission(permissions, "ace.settings.manage")) {
    return (
      <NoAccessCard
        title="Subject timetable"
        message="You do not have permission to manage the ACE subject timetable."
      />
    );
  }
  return <HeadSubjectTimetableWorkspace />;
}
