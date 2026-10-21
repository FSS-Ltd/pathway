"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  createSlip,
  createTrip,
  type StaffTrip,
} from "@/lib/ace-trip-slips-api";
import { requestFailure } from "@/lib/request-error";

const fieldClass =
  "w-full rounded-lg border border-border-subtle bg-surface px-3 py-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

export function TripDraftForm({
  siteId,
  onCreated,
}: {
  siteId: string;
  onCreated: (trip: StaffTrip) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("The trip end must be after its start.");
      return;
    }
    setPending(true);
    try {
      const trip = await createTrip(siteId, {
        title: title.trim(),
        destination: destination.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      onCreated({ ...trip, cancelledAt: null, permissionSlip: null });
      setTitle("");
      setDestination("");
      setStartsAt("");
      setEndsAt("");
    } catch (cause) {
      setError(requestFailure(cause, "The trip could not be created.").message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Create a trip"
      description="Add the visit before drafting its permission slip."
    >
      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Trip title</span>
          <input
            className={fieldClass}
            value={title}
            maxLength={160}
            required
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Destination</span>
          <input
            className={fieldClass}
            value={destination}
            maxLength={240}
            required
            disabled={pending}
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-semibold text-text-primary">
            <span>Start</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={startsAt}
              required
              disabled={pending}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm font-semibold text-text-primary">
            <span>End</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={endsAt}
              required
              disabled={pending}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Creating…" : "Create trip"}
        </Button>
      </form>
    </Card>
  );
}

export function SlipDraftForm({
  siteId,
  trips,
  children,
  limitReached,
  onCreated,
}: {
  siteId: string;
  trips: StaffTrip[];
  children: Array<{ id: string; name: string }>;
  limitReached: boolean;
  onCreated: (slipId: string) => void;
}) {
  const availableTrips = trips.filter(
    (trip) => !trip.cancelledAt && !trip.permissionSlip,
  );
  const [tripId, setTripId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [consentText, setConsentText] = React.useState("");
  const [deadlineAt, setDeadlineAt] = React.useState("");
  const [questions, setQuestions] = React.useState<
    Array<{ label: string; required: boolean }>
  >([]);
  const [selectedChildren, setSelectedChildren] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chosenTrip = availableTrips.find((trip) => trip.id === tripId);
  const visibleChildren = children.filter((child) =>
    child.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!chosenTrip || selectedChildren.length === 0) {
      setError("Choose a trip and at least one pupil.");
      return;
    }
    if (new Date(deadlineAt) >= new Date(chosenTrip.startsAt)) {
      setError("The response deadline must be before the trip starts.");
      return;
    }
    setPending(true);
    try {
      const slip = await createSlip(siteId, chosenTrip.id, {
        title: title.trim(),
        description: description.trim(),
        consentText: consentText.trim(),
        deadlineAt: new Date(deadlineAt).toISOString(),
        questions: questions
          .filter((question) => question.label.trim())
          .map((question) => ({
            label: question.label.trim(),
            required: question.required,
          })),
        recipientChildIds: selectedChildren,
      });
      onCreated(slip.id);
    } catch (cause) {
      setError(
        requestFailure(cause, "The permission-slip draft could not be saved.")
          .message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Draft a permission slip"
      description="The audience and wording are frozen when you publish."
    >
      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Trip</span>
          <select
            className={fieldClass}
            value={tripId}
            required
            disabled={pending}
            onChange={(event) => setTripId(event.target.value)}
          >
            <option value="">Choose a trip</option>
            {availableTrips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        </label>
        {availableTrips.length === 0 ? (
          <p className="text-sm text-text-muted">
            Create a trip first. Each trip can have one permission slip.
          </p>
        ) : null}
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Slip title</span>
          <input
            className={fieldClass}
            value={title}
            maxLength={160}
            required
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Trip information</span>
          <textarea
            className={fieldClass}
            value={description}
            maxLength={4000}
            rows={4}
            disabled={pending}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Exact consent wording</span>
          <textarea
            className={fieldClass}
            value={consentText}
            maxLength={4000}
            rows={6}
            required
            disabled={pending}
            onChange={(event) => setConsentText(event.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-text-primary">
          <span>Response deadline</span>
          <input
            type="datetime-local"
            className={fieldClass}
            value={deadlineAt}
            required
            disabled={pending}
            onChange={(event) => setDeadlineAt(event.target.value)}
          />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-text-primary">
            Questions
          </legend>
          {questions.map((question, index) => (
            <div
              key={index}
              className="rounded-lg border border-border-subtle p-3"
            >
              <label className="block space-y-2 text-sm text-text-primary">
                <span>Question {index + 1}</span>
                <input
                  className={fieldClass}
                  value={question.label}
                  maxLength={240}
                  disabled={pending}
                  onChange={(event) =>
                    setQuestions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={question.required}
                  disabled={pending}
                  onChange={(event) =>
                    setQuestions((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, required: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                Required to accept
              </label>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                disabled={pending}
                onClick={() =>
                  setQuestions((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                Remove question
              </Button>
            </div>
          ))}
          {questions.length < 20 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() =>
                setQuestions((current) => [
                  ...current,
                  { label: "", required: false },
                ])
              }
            >
              Add question
            </Button>
          ) : null}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-text-primary">
            Audience preview: {selectedChildren.length} pupils selected
          </legend>
          {limitReached ? (
            <p role="alert" className="text-sm text-text-primary">
              This site has more pupils than the current audience picker can
              show. Contact support before publishing a whole-school slip.
            </p>
          ) : null}
          <label className="block space-y-2 text-sm text-text-primary">
            <span>Find a pupil</span>
            <input
              className={fieldClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border-subtle p-2">
            {visibleChildren.map((child) => (
              <label
                key={child.id}
                className="flex min-h-11 items-center gap-3 rounded px-2 text-sm text-text-primary hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedChildren.includes(child.id)}
                  disabled={pending}
                  onChange={(event) =>
                    setSelectedChildren((current) =>
                      event.target.checked
                        ? [...current, child.id]
                        : current.filter((id) => id !== child.id),
                    )
                  }
                />
                {child.name}
              </label>
            ))}
            {visibleChildren.length === 0 ? (
              <p className="p-2 text-sm text-text-muted">
                No eligible pupils match.
              </p>
            ) : null}
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            pending || !chosenTrip || children.length === 0 || limitReached
          }
          className="min-h-11"
        >
          {pending ? "Saving…" : "Save private draft"}
        </Button>
      </form>
    </Card>
  );
}
