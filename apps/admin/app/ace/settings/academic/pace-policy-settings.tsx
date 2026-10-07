"use client";

import React from "react";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  AceSettingsRequestError,
  fetchAceSettings,
  updateAcePacePolicy,
  type AceSettings,
} from "@/lib/ace-settings-api";
import { PacePolicyForm, type PacePolicySubmission } from "./pace-policy-form";

export function PacePolicySettings({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = React.useState<AceSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [siteRevision, setSiteRevision] = React.useState(0);
  const [reloadRevision, setReloadRevision] = React.useState(0);
  const siteGeneration = React.useRef(0);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        siteGeneration.current += 1;
        setSiteRevision((current) => current + 1);
        setSettings(null);
        setError(null);
        setSuccess(null);
        setIsLoading(true);
        setIsSaving(false);
      }),
    [],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const generation = siteGeneration.current;
    setIsLoading(true);
    setError(null);
    void fetchAceSettings(controller.signal)
      .then((response) => {
        if (
          !controller.signal.aborted &&
          generation === siteGeneration.current
        ) {
          setSettings(response);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setSettings(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load PACE policy.",
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          generation === siteGeneration.current
        ) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [siteRevision, reloadRevision]);

  const save = async ({ reason, pacePolicy }: PacePolicySubmission) => {
    if (!settings || !canManage || isSaving) return;
    const generation = siteGeneration.current;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAcePacePolicy({
        reason,
        expectedPacePolicyVersion: settings.pacePolicy?.version ?? 0,
        expectedDemeritPolicyVersion: settings.demeritPolicy?.version ?? 0,
        pacePolicy,
      });
      if (generation !== siteGeneration.current) return;
      setSettings(updated);
      setSuccess("PACE policy saved for this site.");
    } catch (cause) {
      if (generation !== siteGeneration.current) return;
      if (cause instanceof AceSettingsRequestError && cause.status === 409) {
        setSettings(null);
        setError(
          "Settings changed elsewhere. Reload and review the latest policy before saving.",
        );
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to save PACE policy.",
        );
      }
    } finally {
      if (generation === siteGeneration.current) setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <PacePolicyForm
        key={siteRevision}
        policy={settings?.pacePolicy ?? null}
        timezone={settings?.timezone ?? null}
        canManage={canManage}
        isAvailable={settings !== null}
        isLoading={isLoading}
        isSaving={isSaving}
        error={error}
        success={success}
        onSave={save}
      />
      {error && !isLoading ? (
        <button
          type="button"
          className="min-h-11 text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setReloadRevision((current) => current + 1)}
        >
          Reload PACE policy
        </button>
      ) : null}
    </div>
  );
}
