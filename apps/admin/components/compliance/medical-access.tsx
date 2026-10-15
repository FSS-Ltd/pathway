"use client";
import React from "react";
import { Button } from "@pathway/ui";
import { useAdminContext } from "@/lib/admin-context";
import { MedicalRegister } from "./medical-register";
import { MedicalEditor } from "./medical-editor";
export function MedicalAccess({ childId }: { childId?: string }) {
  const { state, retry } = useAdminContext();
  if (state.status === "error")
    return (
      <div role="alert">
        <p>Site access could not be loaded.</p>
        <Button
          className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
          onClick={() => void retry()}
        >
          Retry access
        </Button>
      </div>
    );
  if (state.status === "loading" || state.status === "switching")
    return <p role="status">Loading site access…</p>;
  if (state.status !== "ready")
    return (
      <p>Select an active site and sign in to view medical information.</p>
    );
  const { snapshot } = state;
  if (
    !snapshot.capabilities.includes("compliance.medical.read") ||
    !snapshot.permissions.includes("compliance.medical.read")
  )
    return <p>You do not have access to this site’s medical information.</p>;
  const key = `${snapshot.userId}:${snapshot.activeOrgId}:${snapshot.activeSiteId}:${snapshot.generation}:${snapshot.permissions.join(",")}:${childId ?? "register"}`;
  const canManage =
    snapshot.capabilities.includes("compliance.medical.manage") &&
    snapshot.permissions.includes("compliance.medical.manage");
  return childId ? (
    <MedicalEditor key={key} childId={childId} canManage={canManage} />
  ) : (
    <MedicalRegister key={key} canManage={canManage} />
  );
}
