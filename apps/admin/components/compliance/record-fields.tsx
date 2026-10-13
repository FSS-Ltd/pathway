"use client";
import React from "react";
import type {
  ComplianceRecordInput,
  ComplianceRecordKind,
} from "@pathway/types";
import {
  COMPLIANCE_RECORD_KINDS,
  COMPLIANCE_CHECK_SCHEMES,
  COMPLIANCE_RECORD_STATUSES,
} from "@pathway/types";
export const KIND_LABELS: Record<ComplianceRecordKind, string> = {
  BACKGROUND_CHECK: "Background check",
  SAFEGUARDING_TRAINING: "Safeguarding training",
  FIRST_AID: "First aid",
  QUALIFICATION: "Qualification",
  OTHER_TRAINING: "Other training",
};
export const fieldClass =
  "min-h-11 min-w-0 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong";
export function RecordFields({
  value,
  onChange,
  disabled,
}: {
  value: ComplianceRecordInput;
  onChange: (value: ComplianceRecordInput) => void;
  disabled: boolean;
}) {
  const prefix = React.useId();
  function textField(
    key:
      | "subjectName"
      | "roleDescription"
      | "title"
      | "provider"
      | "reference"
      | "completedOn"
      | "reviewDueOn",
    label: string,
    required = false,
    type = "text",
  ) {
    return (
      <label
        className="space-y-1 text-sm font-medium"
        htmlFor={`${prefix}-${key}`}
      >
        {label}
        {required ? " *" : ""}
        <input
          id={`${prefix}-${key}`}
          name={key}
          className={fieldClass}
          type={type}
          max={
            key === "completedOn"
              ? new Date().toISOString().slice(0, 10)
              : undefined
          }
          min={
            key === "reviewDueOn" ? (value.completedOn ?? undefined) : undefined
          }
          required={required}
          maxLength={key === "roleDescription" ? 500 : 200}
          value={value[key] ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              [key]: ["subjectName", "roleDescription", "title"].includes(key)
                ? e.target.value
                : e.target.value || null,
            })
          }
        />
      </label>
    );
  }
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {textField("subjectName", "Person’s name", true)}
      {textField("roleDescription", "Role and responsibilities", true)}
      <label className="space-y-1 text-sm font-medium">
        Record type
        <select
          className={fieldClass}
          value={value.kind}
          onChange={(e) => {
            const kind = COMPLIANCE_RECORD_KINDS.find(
              (k) => k === e.target.value,
            );
            if (kind)
              onChange({
                ...value,
                kind,
                scheme: null,
              });
          }}
        >
          {COMPLIANCE_RECORD_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {value.kind === "BACKGROUND_CHECK" && (
        <label className="space-y-1 text-sm font-medium">
          Check scheme
          <select
            className={fieldClass}
            required
            value={value.scheme ?? ""}
            onChange={(e) => {
              const scheme = COMPLIANCE_CHECK_SCHEMES.find(
                (s) => s === e.target.value,
              );
              if (scheme) onChange({ ...value, scheme });
            }}
          >
            <option value="">Choose a check scheme</option>
            {COMPLIANCE_CHECK_SCHEMES.map((s) => (
              <option key={s} value={s}>
                {s === "ACCESSNI"
                  ? "AccessNI"
                  : s === "LOCAL"
                    ? "Local scheme"
                    : s}
              </option>
            ))}
          </select>
        </label>
      )}
      {textField("title", "Record title", true)}
      {textField("provider", "Issuing body or training provider")}
      {textField("reference", "Reference (optional)")}
      <label className="space-y-1 text-sm font-medium">
        Status
        <select
          className={fieldClass}
          value={value.status}
          onChange={(e) => {
            const status = COMPLIANCE_RECORD_STATUSES.find(
              (s) => s === e.target.value,
            );
            if (status) onChange({ ...value, status });
          }}
        >
          {COMPLIANCE_RECORD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0] + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      {textField(
        "completedOn",
        value.kind === "BACKGROUND_CHECK"
          ? "Certificate issue date"
          : "Completion date",
        value.status !== "PENDING",
        "date",
      )}
      {textField(
        "reviewDueOn",
        "Organisation review date (optional)",
        false,
        "date",
      )}
      <p className="text-sm text-text-muted sm:col-span-2">
        A review date is your organisation’s review schedule. Check any separate
        validity period with the issuing authority. Record checks appropriate to
        the person’s role; an adult or parent account alone does not require a
        check.
      </p>
      {value.scheme === "DBS" && (
        <p className="text-sm text-text-muted sm:col-span-2">
          DBS certificates have no official expiry date; record the issue date
          and your organisation’s review date separately.
        </p>
      )}
      <p className="text-sm text-text-muted sm:col-span-2">
        Record verification evidence and references only. Do not enter
        criminal-history details or certificate copies.
      </p>
      {(["notes", "verificationNotes"] as const).map((key) => (
        <label
          key={key}
          className="space-y-1 text-sm font-medium sm:col-span-2"
        >
          {key === "notes" ? "Notes" : "Verification details"}
          {key === "verificationNotes" && value.status === "VERIFIED"
            ? " *"
            : ""}
          <textarea
            className={fieldClass}
            rows={3}
            maxLength={key === "notes" ? 5000 : 2000}
            required={
              key === "verificationNotes" && value.status === "VERIFIED"
            }
            value={value[key] ?? ""}
            onChange={(e) =>
              onChange({ ...value, [key]: e.target.value || null })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
