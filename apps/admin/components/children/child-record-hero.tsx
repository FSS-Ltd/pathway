"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge, Button, Card } from "@pathway/ui";
import { Pencil } from "lucide-react";
import { getInitials } from "../../lib/names";
import type { AdminChildDetail } from "../../lib/api-client";

export function ChildRecordHero({
  childId,
  detail,
  personLabel,
  canEdit,
}: {
  childId: string;
  detail: AdminChildDetail;
  personLabel: string;
  canEdit: boolean;
}) {
  const [photoFailed, setPhotoFailed] = React.useState(false);
  React.useEffect(() => setPhotoFailed(false), [childId]);
  const name = detail.preferredName?.trim() || detail.fullName;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-lg font-bold text-accent-strong">
          {!photoFailed ? (
            <Image
              src={`/api/children/${encodeURIComponent(childId)}/photo`}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span aria-hidden="true">{getInitials(name)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
            {personLabel} record
          </p>
          <h1 className="break-words text-xl font-bold text-text-primary sm:text-2xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {detail.primaryGroupLabel ??
              detail.ageGroupLabel ??
              "No group assigned"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.status === "active" ? "success" : "default"}>
            {detail.status === "active" ? "Active" : "Inactive"}
          </Badge>
          {canEdit ? (
            <Button asChild variant="secondary" size="sm">
              <Link
                href={`/children/${encodeURIComponent(childId)}/edit`}
                className="inline-flex items-center gap-2"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit profile
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
