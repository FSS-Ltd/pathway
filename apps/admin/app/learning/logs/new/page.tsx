"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card, Input, Select } from "@pathway/ui";
import {
  type AdminChildRow,
  type AdminLearningSubject,
  createLearningLog,
  fetchChildren,
  fetchLearningSubjects,
} from "../../../../lib/api-client";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function NewLearningLogPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [children, setChildren] = React.useState<AdminChildRow[]>([]);
  const [subjects, setSubjects] = React.useState<AdminLearningSubject[]>([]);
  const [childId, setChildId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [activityDate, setActivityDate] = React.useState(today);
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    void Promise.all([fetchChildren(), fetchLearningSubjects()])
      .then(([nextChildren, nextSubjects]) => {
        setChildren(nextChildren.filter((child) => child.status === "active"));
        setSubjects(nextSubjects.filter((subject) => subject.isActive));
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load form options",
        ),
      );
  }, [session, sessionStatus]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsedMinutes = minutes ? Number(minutes) : undefined;
    if (
      !childId ||
      !title.trim() ||
      (parsedMinutes !== undefined &&
        (!Number.isInteger(parsedMinutes) || parsedMinutes <= 0))
    ) {
      setError(
        "Choose a child, enter an activity title, and use whole positive minutes when provided.",
      );
      return;
    }
    setIsSubmitting(true);
    try {
      await createLearningLog({
        childId,
        subjectId: subjectId || undefined,
        activityDate,
        title,
        minutes: parsedMinutes,
        description,
      });
      router.push("/learning");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to record learning activity",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Record learning
        </h1>
        <p className="text-sm text-text-muted">
          Add a learning activity for a child.
        </p>
      </div>
      <Card
        title="Learning activity"
        description="Fields marked required are needed to save the entry."
      >
        <form className="flex max-w-2xl flex-col gap-4" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-md bg-status-danger/5 p-3 text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Child
            <Select
              required
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
            >
              <option value="">Choose a child</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.fullName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Subject
            <Select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Activity title
            <Input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={240}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
              Date
              <Input
                required
                type="date"
                value={activityDate}
                onChange={(event) => setActivityDate(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
              Minutes
              <Input
                type="number"
                min="1"
                max="1440"
                step="1"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Description
            <textarea
              className="min-h-28 rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={10000}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save learning activity"}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/learning">Cancel</Link>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
