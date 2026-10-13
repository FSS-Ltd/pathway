"use client";
import React from "react";
import { Button } from "@pathway/ui";
import { useAdminContext } from "@/lib/admin-context";
import { ChecksRegister } from "@/components/compliance/checks-register";
export default function ComplianceChecksPage() {
  const { state, retry } = useAdminContext();
  if (state.status === "error")
    return (
      <div role="alert">
        <p>Site access could not be loaded.</p>
        <Button onClick={() => void retry()}>Retry access</Button>
      </div>
    );
  if (state.status === "loading" || state.status === "switching")
    return <p role="status">Loading site access…</p>;
  if (state.status !== "ready")
    return <p>Select an active site and sign in to view its register.</p>;
  const { snapshot } = state;
  if (
    !snapshot.capabilities.includes("compliance.checks.read") ||
    !snapshot.permissions.includes("compliance.checks.read")
  )
    return (
      <p>You do not have access to this site’s checks and training register.</p>
    );
  return (
    <ChecksRegister
      key={`${snapshot.userId}:${snapshot.activeOrgId}:${snapshot.activeSiteId}:${snapshot.generation}:${snapshot.permissions.join(",")}`}
      canManage={snapshot.permissions.includes("compliance.checks.manage")}
    />
  );
}
