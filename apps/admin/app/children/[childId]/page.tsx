"use client";

import { useParams } from "next/navigation";
import { ChildProfileWorkspace } from "../../../components/children/child-profile-workspace";

export default function ChildDetailPage() {
  const { childId } = useParams<{ childId: string }>();
  return <ChildProfileWorkspace childId={childId} />;
}
