"use client";

import Link from "next/link";
import React from "react";
import { useSession } from "@/lib/use-session-compat";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  type ColumnDef,
} from "@pathway/ui";
import {
  type AdminLearningSubject,
  createLearningSubject,
  fetchLearningSubjects,
} from "../../../lib/api-client";

export default function LearningSubjectsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [subjects, setSubjects] = React.useState<AdminLearningSubject[]>([]);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSubjects(await fetchLearningSubjects());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load subjects",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  React.useEffect(() => {
    if (sessionStatus === "authenticated" && session) void load();
  }, [load, session, sessionStatus]);
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a subject name.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const subject = await createLearningSubject({
        name,
        category: category || undefined,
      });
      setSubjects((current) =>
        [...current, subject].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setCategory("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to create subject",
      );
    } finally {
      setIsSubmitting(false);
    }
  }
  const columns = React.useMemo<ColumnDef<AdminLearningSubject>[]>(
    () => [
      {
        id: "name",
        header: "Subject",
        cell: (row) => (
          <span className="font-semibold text-text-primary">{row.name}</span>
        ),
      },
      {
        id: "category",
        header: "Category",
        cell: (row) => row.category ?? "-",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={row.isActive ? "success" : "default"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        width: "120px",
        align: "center",
      },
    ],
    [],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Subjects
          </h1>
          <p className="text-sm text-text-muted">
            Organise learning activity with the subjects used by this
            organisation.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/learning">Back to Learning</Link>
        </Button>
      </div>
      <Card
        title="Add subject"
        description="Subjects are available when recording learning activity."
      >
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text-primary">
            Subject name
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-text-primary">
            Category (optional)
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              maxLength={120}
            />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding…" : "Add subject"}
          </Button>
        </form>
      </Card>
      <Card
        title="Subjects"
        description="Active subjects can be selected on learning entries."
      >
        {error ? (
          <div className="mb-3 rounded-md bg-status-danger/5 p-3 text-sm text-status-danger">
            <span>{error}</span>
            <Button
              className="ml-3"
              size="sm"
              variant="secondary"
              onClick={load}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <DataTable
          data={subjects}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No subjects have been added yet."
        />
      </Card>
    </div>
  );
}
