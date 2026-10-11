import * as React from "react";
import { Badge, Card } from "@pathway/ui";
import type { AdminChildGuardianContact } from "../../lib/api-client";

export function ChildGuardianSection({
  contacts,
  invites,
}: {
  contacts: AdminChildGuardianContact[];
  invites?: React.ReactNode;
}) {
  return (
    <section
      id="guardians"
      aria-labelledby="profile-guardians-heading"
      className="scroll-mt-6 space-y-4"
    >
      <Card className="p-6">
        <h2
          id="profile-guardians-heading"
          className="text-lg font-bold text-text-primary"
        >
          Parent and guardian contacts
        </h2>
        {contacts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="min-w-0 rounded-lg border border-border-subtle bg-surface-alt p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text-primary">
                    {contact.fullName}
                  </p>
                  <Badge variant="default">Record only</Badge>
                </div>
                <dl className="mt-3 min-w-0 grid gap-1 break-words text-sm text-text-muted [overflow-wrap:anywhere]">
                  <div>
                    <dt className="inline font-medium">Relationship: </dt>
                    <dd className="inline">
                      {contact.relationshipToChild ?? "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Email: </dt>
                    <dd className="inline">
                      {contact.email ?? "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Phone: </dt>
                    <dd className="inline">
                      {contact.phone ?? "Not provided"}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-muted">
            No guardian contacts have been recorded.
          </p>
        )}
      </Card>
      {invites}
    </section>
  );
}
