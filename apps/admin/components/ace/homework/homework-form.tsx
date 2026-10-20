"use client";

import React from "react";
import { Button, Card, Input, Label, Select, Textarea } from "@pathway/ui";
import type {
  HomeworkAssignment,
  HomeworkDraft,
  HomeworkOptions,
} from "@/lib/ace-homework-api";

function localDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function HomeworkForm({
  options,
  editing,
  pending,
  onSave,
  onClose,
}: {
  options: HomeworkOptions;
  editing: HomeworkAssignment | null;
  pending: boolean;
  onSave: (draft: HomeworkDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [instructions, setInstructions] = React.useState(
    editing?.instructions ?? "",
  );
  const [academicYearId, setAcademicYearId] = React.useState(
    editing?.academicYearId ?? options.academicYears[0]?.id ?? "",
  );
  const [yearBandId, setYearBandId] = React.useState(
    editing?.yearBandId ?? options.yearBands[0]?.id ?? "",
  );
  const [subjectId, setSubjectId] = React.useState(
    editing?.subjectId ?? options.subjects[0]?.id ?? "",
  );
  const [dueAt, setDueAt] = React.useState(
    editing ? localDateTime(editing.dueAt) : "",
  );
  const available =
    options.academicYears.length > 0 &&
    options.yearBands.length > 0 &&
    options.subjects.length > 0;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!available || pending || !dueAt) return;
    const parsed = new Date(dueAt);
    if (Number.isNaN(parsed.getTime())) return;
    void onSave({
      title: title.trim(),
      instructions: instructions.trim(),
      academicYearId,
      yearBandId,
      subjectId,
      dueAt: parsed.toISOString(),
    });
  };

  return (
    <Card
      title={editing ? "Edit draft" : "New assignment"}
      description="Write the task and choose the class before sharing it with pupils."
    >
      <form onSubmit={submit} className="space-y-4">
        {!available ? (
          <p className="text-sm text-text-muted">
            Set up an active academic year, class and subject before creating
            homework.
          </p>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="homework-title">Title</Label>
          <Input
            id="homework-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
            disabled={pending || !available}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="homework-instructions">Instructions</Label>
          <Textarea
            id="homework-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={10000}
            rows={5}
            required
            disabled={pending || !available}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="homework-year">Academic year</Label>
            <Select
              id="homework-year"
              value={academicYearId}
              onChange={(event) => setAcademicYearId(event.target.value)}
              required
              disabled={pending || !available}
            >
              {options.academicYears.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="homework-class">Class</Label>
            <Select
              id="homework-class"
              value={yearBandId}
              onChange={(event) => setYearBandId(event.target.value)}
              required
              disabled={pending || !available}
            >
              {options.yearBands.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="homework-subject">Subject</Label>
            <Select
              id="homework-subject"
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              required
              disabled={pending || !available}
            >
              {options.subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="homework-due">Due date and time</Label>
            <Input
              id="homework-due"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              required
              disabled={pending || !available}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !available}>
            {pending ? "Saving…" : editing ? "Save draft" : "Create draft"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
