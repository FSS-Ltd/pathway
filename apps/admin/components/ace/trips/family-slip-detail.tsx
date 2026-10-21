"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilySlip,
  type FamilySlipDetail,
} from "@/lib/ace-trip-slips-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { FamilySlipResponseForm } from "./family-slip-response-form";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; slip: FamilySlipDetail };
export function FamilySlipDetailView({
  siteId,
  childId,
  slipId,
  status,
}: {
  siteId: string;
  childId: string;
  slipId: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);
  const heading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchFamilySlip(siteId, childId, slipId, controller.signal)
      .then((slip) => {
        if (controller.signal.aborted) return;
        setLoad({ state: "ready", slip });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [siteId, childId, slipId, status, revision]);

  const slip = load.state === "ready" ? load.slip : null;
  const listHref = `/ace/parent/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/slips`;
  const reload = () => {
    setRevision((value) => value + 1);
    heading.current?.focus();
  };

  return (
    <main className="min-w-0 space-y-6">
      <header className="space-y-2">
        <Link
          href={listHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to permission slips
        </Link>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
        >
          {slip?.snapshot.title ?? "Trip permission slip"}
        </h1>
        {slip ? (
          <p className="text-sm text-text-muted">
            {slip.snapshot.tripTitle} · Version {slip.version} · Respond by{" "}
            {new Date(slip.snapshot.deadlineAt).toLocaleDateString()}
          </p>
        ) : null}
      </header>
      {status === "loading" ||
      (status === "authenticated" && load.state === "loading") ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading permission slip…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <Button asChild className="mt-4 min-h-11">
            <Link
              href={`/login?returnTo=${encodeURIComponent(`${listHref}/${slipId}`)}`}
            >
              Sign in
            </Link>
          </Button>
        </Card>
      ) : load.state === "error" ? (
        <Card title="This slip could not be loaded">
          <p role="alert" className="text-sm text-text-muted">
            Check your connection or child access, then try again.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </Button>
        </Card>
      ) : slip ? (
        <div className="space-y-6">
          {slip.needsReconsent ? (
            <div
              role="status"
              className="rounded-xl border border-accent-strong bg-accent-subtle p-4 text-sm text-text-primary"
            >
              The school changed this slip. Read this version and give a new
              response if you agree.
            </div>
          ) : null}
          <Card title="Read before you decide">
            <dl className="space-y-3 text-sm leading-6">
              <div>
                <dt className="font-semibold text-text-primary">Destination</dt>
                <dd className="text-text-muted">{slip.snapshot.destination}</dd>
              </div>
              <div>
                <dt className="font-semibold text-text-primary">Trip dates</dt>
                <dd className="text-text-muted">
                  {new Date(slip.snapshot.startsAt).toLocaleString()} to{" "}
                  {new Date(slip.snapshot.endsAt).toLocaleString()}
                </dd>
              </div>
            </dl>
            {slip.snapshot.description ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-text-primary">
                {slip.snapshot.description}
              </p>
            ) : null}
            <h2 className="mt-6 font-heading text-lg font-semibold text-text-primary">
              Consent wording
            </h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-base leading-8 text-text-primary">
              {slip.snapshot.consentText}
            </p>
          </Card>
          {slip.response || slip.exception ? (
            <Card title="Response recorded">
              <p role="status" className="text-sm leading-6 text-text-primary">
                {slip.response
                  ? `You ${slip.response.decision === "ACCEPTED" ? "accepted" : "declined"} on ${new Date(slip.response.respondedAt).toLocaleDateString()}.`
                  : `The school recorded a ${slip.exception?.decision === "ACCEPTED" ? "consent" : "decline"} on ${new Date(slip.exception?.recordedAt ?? "").toLocaleDateString()}.`}
              </p>
            </Card>
          ) : slip.closed ? (
            <Card title="Responses are closed">
              <p className="text-sm text-text-muted">
                The deadline has passed or the trip was cancelled. Contact the
                school if you need help.
              </p>
            </Card>
          ) : !slip.onlineResponsesEnabled ? (
            <Card title="Online responses are not available yet">
              <p className="text-sm text-text-muted">
                Please use the school’s current permission-slip process.
              </p>
            </Card>
          ) : slip.canRespond ? (
            <FamilySlipResponseForm
              slip={slip}
              siteId={siteId}
              childId={childId}
              onRecorded={reload}
              onReload={reload}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export function FamilySlipDetail({
  siteId,
  childId,
  slipId,
}: {
  siteId: string;
  childId: string;
  slipId: string;
}) {
  const { data, status } = useSession();
  return (
    <FamilySlipDetailView
      key={`${siteId}:${childId}:${slipId}:${data?.user?.id ?? ""}`}
      siteId={siteId}
      childId={childId}
      slipId={slipId}
      status={status}
    />
  );
}
