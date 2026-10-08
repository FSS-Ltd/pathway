"use client";

import * as React from "react";
import { Badge, Button, Card, Label, Select } from "@pathway/ui";
import { toast } from "sonner";
import { Checkbox } from "../ui/checkbox";
import { GuardianAccessRevokeForm } from "./guardian-access-revoke-form";
import { subscribeToActiveSiteChanges } from "../../lib/active-site-events";
import {
  approveGuardianAccess,
  fetchGuardianAccessReview,
  type GuardianAccessReview,
  type GuardianReviewBasis,
} from "../../lib/guardian-access-review-api";

const reviewBasisOptions: { value: GuardianReviewBasis; label: string }[] = [
  { value: "SCHOOL_RECORDS", label: "School records" },
  { value: "LEGAL_DOCUMENT", label: "Legal document" },
];

export function GuardianAccessReviewCard({ parentId }: { parentId: string }) {
  const [review, setReview] = React.useState<GuardianAccessReview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = React.useState<string | null>(
    null,
  );
  const [basis, setBasis] =
    React.useState<GuardianReviewBasis>("SCHOOL_RECORDS");
  const [confirmed, setConfirmed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      setSelectedChildId(null);
      setConfirmed(false);
      setRevision((value) => value + 1);
    };
    const unsubscribe = subscribeToActiveSiteChanges(refresh);
    setLoading(true);
    setError(null);
    void fetchGuardianAccessReview(parentId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReview(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReview(null);
          setError("Guardian access could not be loaded. Please retry.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [parentId, revision]);

  const approve = async (childId: string) => {
    if (!confirmed || !review?.hasVerifiedSignIn || saving) return;
    setSaving(true);
    setError(null);
    try {
      await approveGuardianAccess(parentId, childId, basis);
      toast.success("Guardian access approved for this child.");
      setSelectedChildId(null);
      setConfirmed(false);
      setRevision((value) => value + 1);
    } catch {
      setError("Approval failed. Please check the parent link and retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Guardian access review"
      description="Approve each existing parent-child link after checking legal access. Approvals are audited and scoped to this site."
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={loading || saving}
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh
        </Button>
      }
    >
      {loading ? (
        <p className="text-sm text-text-muted">Loading access…</p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {!loading && review ? (
        <div className="space-y-4">
          {!review.hasVerifiedSignIn ? (
            <p className="rounded-md border border-border-subtle bg-muted p-3 text-sm text-text-muted">
              The parent must sign in with their existing email before access
              can be approved.
            </p>
          ) : null}
          {!review.parentPortalEnabled ? (
            <p className="rounded-md border border-border-subtle bg-muted p-3 text-sm text-text-muted">
              The parent portal is currently off. An approval will not open the
              portal until it is enabled in settings.
            </p>
          ) : null}
          {review.children.length === 0 ? (
            <p className="text-sm text-text-muted">
              No linked children at this site.
            </p>
          ) : (
            <ul className="space-y-3">
              {review.children.map((child) => {
                const selected = selectedChildId === child.id;
                const canReview =
                  review.hasVerifiedSignIn &&
                  !child.hasFullAccess &&
                  !child.isGuest;
                return (
                  <li
                    key={child.id}
                    className="rounded-md border border-border-subtle p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-text-primary">
                        {child.fullName}
                      </span>
                      {child.hasFullAccess ? (
                        <Badge variant="success">Full access approved</Badge>
                      ) : child.isGuest ? (
                        <Badge variant="default">Guest child</Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11"
                          disabled={!canReview || saving}
                          onClick={() => {
                            setSelectedChildId(selected ? null : child.id);
                            setConfirmed(false);
                          }}
                        >
                          {selected ? "Cancel review" : "Review access"}
                        </Button>
                      )}
                    </div>
                    {child.hasFullAccess ? (
                      <div className="mt-3">
                        <GuardianAccessRevokeForm
                          parentId={parentId}
                          childId={child.id}
                          childName={child.fullName}
                          onRevoked={() => {
                            toast.success(
                              "Guardian access revoked for this child.",
                            );
                            setRevision((value) => value + 1);
                          }}
                        />
                      </div>
                    ) : null}
                    {selected && canReview ? (
                      <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                        <div>
                          <Label htmlFor={`review-basis-${child.id}`}>
                            Evidence checked
                          </Label>
                          <Select
                            id={`review-basis-${child.id}`}
                            value={basis}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (
                                value === "SCHOOL_RECORDS" ||
                                value === "LEGAL_DOCUMENT"
                              ) {
                                setBasis(value);
                              }
                            }}
                            className="mt-1 max-w-sm"
                          >
                            {reviewBasisOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <label className="flex items-start gap-2 text-sm text-text-primary">
                          <Checkbox
                            checked={confirmed}
                            onChange={(event) =>
                              setConfirmed(event.target.checked)
                            }
                            disabled={saving}
                          />
                          <span>
                            I confirmed this parent has legal access to this
                            child at this site.
                          </span>
                        </label>
                        <Button
                          className="min-h-11"
                          disabled={!confirmed || saving}
                          onClick={() => void approve(child.id)}
                        >
                          {saving ? "Approving…" : "Approve full access"}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}
