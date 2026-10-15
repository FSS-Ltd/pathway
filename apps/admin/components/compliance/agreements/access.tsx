"use client";
import React from "react";
import { useAdminContext } from "@/lib/admin-context";
import { AgreementsWorkspace } from "./workspace";
import { Action } from "./shared";
export function AgreementsAccess() {
  const { state, retry } = useAdminContext();
  if (state.status === "error")
    return (
      <div role="alert">
        <p>Site access could not be loaded.</p>
        <Action onClick={() => void retry()}>Retry access</Action>
      </div>
    );
  if (state.status === "loading" || state.status === "switching")
    return <p role="status">Loading site access…</p>;
  if (state.status !== "ready")
    return <p>Select an active site and sign in to view agreements.</p>;
  const { snapshot } = state;
  if (!snapshot.capabilities.includes("compliance.agreements.read"))
    return <p>User Agreements are not available for this site.</p>;
  const canRead = snapshot.permissions.includes("compliance.agreements.read");
  const canManage =
    snapshot.capabilities.includes("compliance.agreements.manage") &&
    snapshot.permissions.includes("compliance.agreements.manage");
  return (
    <AgreementsWorkspace
      key={`${snapshot.userId}:${snapshot.activeOrgId}:${snapshot.activeSiteId}:${snapshot.generation}:${snapshot.permissions.join(",")}`}
      canRead={canRead || canManage}
      canManage={canManage}
    />
  );
}
