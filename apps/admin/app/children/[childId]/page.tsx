"use client";

import { useParams } from "next/navigation";
import { ChildRecordWorkspace } from "../../../components/children/child-record-workspace";

export default function ChildRecordPage() {
  const { childId } = useParams<{ childId: string }>();
  return <ChildRecordWorkspace childId={childId} />;
}
