"use client";

import React from "react";
import { NoAccessCard } from "@/components/no-access-card";
import { BehaviourForm } from "@/components/ace/behaviour/behaviour-form";
import { BehaviourHistory } from "@/components/ace/behaviour/behaviour-history";
import {
  correctBehaviour,
  fetchBehaviourHistory,
  fetchBehaviourPolicy,
  fetchChildren,
  recordBehaviour,
  type AdminBehaviourCategory,
  type AdminBehaviourEntry,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

export default function BehaviourPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasFreshPermission(permissions, "ace.behaviour.read");
  const canRecord = hasFreshPermission(permissions, "ace.behaviour.record");
  const canSensitive = hasFreshPermission(
    permissions,
    "ace.behaviour.sensitive.read",
  );
  const [children, setChildren] = React.useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const [categories, setCategories] = React.useState<AdminBehaviourCategory[]>(
    [],
  );
  const [history, setHistory] = React.useState<AdminBehaviourEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextChildren, policy, nextHistory] = await Promise.all([
        fetchChildren(),
        fetchBehaviourPolicy(),
        fetchBehaviourHistory({ limit: 50 }),
      ]);
      setChildren(
        nextChildren
          .filter((child) => child.status === "active")
          .map((child) => ({ id: child.id, fullName: child.fullName })),
      );
      setCategories(policy.categories);
      setHistory(nextHistory.items);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Unable to load behaviour capture.",
      );
      setHistory([]);
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

  if (isLoadingAccess) return null;
  if (!canRead) {
    return (
      <NoAccessCard
        title="Behaviour capture"
        message="You do not have permission to view ACE behaviour records."
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Behaviour capture
        </h1>
        <p className="text-sm text-text-muted">
          Record site categories and correct current facts without replacing the
          server-owned behaviour policy or escalation rules.
        </p>
      </div>

      {canRecord ? (
        <BehaviourForm
          children={children}
          categories={categories}
          canSensitive={canSensitive}
          disabled={isLoading}
          onSave={recordBehaviour}
          onSuccess={load}
        />
      ) : null}

      <BehaviourHistory
        isLoading={isLoading}
        error={error}
        items={history}
        children={children}
        canCorrect={canRecord}
        canSensitive={canSensitive}
        onRetry={() => void load()}
        onCorrect={correctBehaviour}
        onSuccess={load}
      />
    </div>
  );
}

function hasFreshPermission(
  permissions: string[] | null,
  permission: string,
): boolean {
  return permissions?.includes(permission) === true;
}
