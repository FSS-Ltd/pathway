import React from "react";
import Link from "next/link";
import type { AccessPerson, PersonAccess } from "@/lib/roles-access-api";

export function ProfileFacts({
  person,
  access,
  orgName,
  siteName,
}: {
  person: AccessPerson;
  access: PersonAccess;
  orgName: string;
  siteName: string | null;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Email
        </dt>
        <dd className="mt-1 break-all text-sm text-text-primary">
          {access.user.email}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Status
        </dt>
        <dd className="mt-1 text-sm text-text-primary">
          {access.user.isActive ? "Active" : "Inactive"}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Organisation
        </dt>
        <dd className="mt-1 text-sm text-text-primary">{orgName}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Membership
        </dt>
        <dd className="mt-1 text-sm text-text-primary">
          {person.orgRole.replaceAll("_", " ")}
        </dd>
      </div>
      {siteName && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Selected site
          </dt>
          <dd className="mt-1 text-sm text-text-primary">
            {access.targetInSelectedSite
              ? siteName
              : `Not a member of ${siteName}`}
          </dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Full profile
        </dt>
        <dd className="mt-1">
          <Link
            href={
              person.hasFamilyAccess
                ? `/parents/${person.id}`
                : `/people/${person.id}`
            }
            className="rounded text-sm font-medium text-accent-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
          >
            Open {person.hasFamilyAccess ? "Parent" : "People"} profile
          </Link>
        </dd>
      </div>
    </dl>
  );
}
