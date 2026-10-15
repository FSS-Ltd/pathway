"use client";
import React, { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChildProfileWorkspace } from "../../../../components/children/child-profile-workspace";
import { MedicalAccess } from "@/components/compliance/medical-access";
function ChildEditContent() {
  const { childId } = useParams<{ childId: string }>();
  const search = useSearchParams();
  return search.get("section") === "medical" ? (
    <MedicalAccess childId={childId} />
  ) : (
    <ChildProfileWorkspace childId={childId} />
  );
}
export default function EditChildProfilePage() {
  return (
    <Suspense fallback={<p role="status">Loading child profile…</p>}>
      <ChildEditContent />
    </Suspense>
  );
}
