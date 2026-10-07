"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import { NoAccessCard } from "@/components/no-access-card";
import { hasPermission } from "@/lib/access";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { useAdminAccess } from "@/lib/use-admin-access";
import {
  fetchAttendanceDetailBySessionId,
  saveAttendanceForSession,
  setApiClientToken,
} from "../../../lib/api-client";
import type {
  AdminAttendanceDetail,
  SaveAttendanceRow,
} from "../../../lib/api-client";
import { AttendanceRegister } from "./attendance-register";

export default function AttendanceDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasPermission(permissions, "attendance.read");
  const canManage = permissions?.includes("attendance.manage") === true;
  const sessionId = params.sessionId;
  const siteGeneration = React.useRef(0);

  const [detail, setDetail] = React.useState<AdminAttendanceDetail | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  const load = React.useCallback(async () => {
    const requestGeneration = siteGeneration.current;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await fetchAttendanceDetailBySessionId(sessionId);
      if (requestGeneration !== siteGeneration.current) return;
      setNotFound(result === null);
      setDetail(result);
    } catch (cause) {
      if (requestGeneration !== siteGeneration.current) return;
      setError(
        cause instanceof Error ? cause.message : "Failed to load attendance",
      );
      setDetail(null);
    } finally {
      if (requestGeneration === siteGeneration.current) setIsLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session || !canRead) return;
    const token = (session as { accessToken?: string }).accessToken ?? null;
    setApiClientToken(token);
    void load();
  }, [sessionStatus, session, canRead, load]);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        siteGeneration.current += 1;
        setDetail(null);
        router.replace("/attendance");
      }),
    [router],
  );

  const save = React.useCallback(
    async (rows: SaveAttendanceRow[]) => {
      const updated = await saveAttendanceForSession(sessionId, rows);
      setDetail(updated);
      return updated;
    },
    [sessionId],
  );

  const reconcile = React.useCallback(async () => {
    const updated = await fetchAttendanceDetailBySessionId(sessionId);
    if (!updated) throw new Error("Attendance session not found.");
    return updated;
  }, [sessionId]);

  return (
    <div className="flex flex-col gap-4">
      <Button
        asChild
        className="min-h-11 self-start"
        size="sm"
        variant="secondary"
      >
        <Link className="inline-flex items-center gap-2" href="/attendance">
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Back to attendance
        </Link>
      </Button>

      {sessionStatus === "loading" ||
      isLoadingAccess ||
      (sessionStatus === "authenticated" && canRead && isLoading) ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div
              className="flex flex-col gap-3"
              aria-label="Loading attendance…"
            >
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : !canRead ? (
        <NoAccessCard
          title="Attendance"
          message="You do not have permission to view this register."
        />
      ) : notFound ? (
        <Card title="Attendance not found">
          <p className="text-sm text-text-muted">
            We could not find attendance for this session.
          </p>
          <Button
            className="mt-4 min-h-11"
            onClick={() => router.push("/attendance")}
            variant="secondary"
          >
            Back to attendance
          </Button>
        </Card>
      ) : error ? (
        <Card title="Unable to load attendance">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              onClick={() => router.push("/attendance")}
              variant="secondary"
            >
              Back
            </Button>
            <Button className="min-h-11" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : detail ? (
        <AttendanceRegister
          canManage={canManage}
          detail={detail}
          onReconcile={reconcile}
          onRefresh={load}
          onSave={save}
        />
      ) : null}
    </div>
  );
}
