"use client";
import React from "react";
import { useAdminContext } from "@/lib/admin-context";
import { Action } from "../agreements/shared";
import { TrackerWorkspace } from "./workspace";
export function TrackerAccess() {
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
    return <p>Select an active site and sign in to view the tracker.</p>;
  const { snapshot } = state;
  if (
    !snapshot.capabilities.includes("compliance.tracker.read") ||
    !snapshot.permissions.includes("compliance.tracker.read")
  )
    return <p>You do not have access to this site’s compliance tracker.</p>;
  return (
    <TrackerWorkspace
      key={`${snapshot.userId}:${snapshot.activeOrgId}:${snapshot.activeSiteId}:${snapshot.generation}:${snapshot.permissions.join(",")}`}
      canManage={
        snapshot.capabilities.includes("compliance.tracker.manage") &&
        snapshot.permissions.includes("compliance.tracker.manage")
      }
    />
  );
}
