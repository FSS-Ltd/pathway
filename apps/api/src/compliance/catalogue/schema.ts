import { conditionSchema } from "./conditions";
export type { Condition } from "./conditions";
import { z } from "zod";
import { TRACKER_TOPICS } from "@pathway/types";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid calendar date",
  );
const text = z.string().trim().min(1);
const review = z
  .object({
    reviewer: text,
    verifiedAt: date,
    reviewDueAt: date,
    revision: text,
  })
  .strict()
  .refine(
    (v) =>
      v.reviewDueAt >= v.verifiedAt &&
      (Date.parse(v.reviewDueAt) - Date.parse(v.verifiedAt)) / 86400000 <= 90,
    "Review must expire within 90 days",
  );
const effective = z
  .object({ from: date, to: date.nullable() })
  .strict()
  .refine((v) => !v.to || v.to >= v.from, "Invalid effective range");
const sector = z.enum([
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
]);
const status = z.enum([
  "NOT_REVIEWED",
  "IN_REVIEW",
  "REVIEWED",
  "PUBLISHED",
  "REVIEWED_NO_REQUIREMENTS",
  "STALE",
  "UNAVAILABLE",
  "WITHDRAWN",
]);
const sourceEffective = z
  .object({
    from: date.nullable(),
    to: date.nullable(),
    unknownReason: text.nullable(),
  })
  .strict()
  .refine(
    (value) => value.from !== null || value.unknownReason !== null,
    "Unknown effective date needs a reason",
  )
  .refine(
    (value) => !value.from || !value.to || value.to >= value.from,
    "Invalid effective range",
  );
const source = z
  .object({
    id: text,
    url: z.string().url(),
    title: text,
    authority: text,
    provision: text,
    territory: z.array(text).min(1),
    language: text,
    classification: z.enum(["LEGISLATION", "GUIDANCE", "PROVIDER"]),
    publishedAt: date.nullable(),
    publishedDateUnknownReason: text.nullable(),
    effective: sourceEffective,
    retrievedAt: date,
    review,
    state: z.enum(["REVIEWED", "WITHDRAWN"]),
    translationProvenance: text.nullable(),
  })
  .strict()
  .superRefine((s, c) => {
    if (s.publishedAt === null && !s.publishedDateUnknownReason)
      c.addIssue({
        code: "custom",
        message: "Unknown publication date needs a reason",
      });
  });
const requirement = z
  .object({
    id: text,
    version: z.number().int().positive(),
    action: text,
    topic: z.enum(TRACKER_TOPICS),
    obligationClass: z.enum([
      "STATUTORY_DUTY",
      "STATUTORY_GUIDANCE",
      "RECOMMENDATION",
      "PROVIDER_REQUIREMENT",
    ]),
    jurisdiction: text,
    sectors: z.array(sector).min(1),
    condition: conditionSchema.nullable(),
    applicabilityExplanation: text,
    unknownExplanation: text,
    expectedEvidence: z.array(text).min(1),
    allowsNotApplicable: z.boolean(),
    notApplicablePolicy: text.nullable(),
    sourceIds: z.array(text).min(1),
    signalKeys: z.array(
      z.enum([
        "personnel",
        "agreements",
        "attendance",
        "medical",
        "safeguarding",
        "trips",
        "ace",
      ]),
    ),
    effective,
    review,
    state: z.enum(["PUBLISHED", "WITHDRAWN"]),
    materialChangeReason: text,
    supersedesVersion: z.number().int().positive().nullable(),
    reviewCadenceDays: z.number().int().positive(),
    reviewCadenceBasis: text,
  })
  .strict()
  .superRefine((r, c) => {
    if (r.allowsNotApplicable && (!r.condition || !r.notApplicablePolicy))
      c.addIssue({
        code: "custom",
        message:
          "Unconditional requirements cannot permit N/A; policy required",
      });
  });
const coverage = z
  .object({
    jurisdiction: text,
    sector,
    topic: z.enum(TRACKER_TOPICS),
    status,
    regionalStatus: status,
    regions: z.array(text),
    requiresRegion: z.boolean(),
    reason: text,
    sourceIds: z.array(text),
    review: review.nullable(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      (["PUBLISHED", "REVIEWED_NO_REQUIREMENTS"].includes(c.status) ||
        ["PUBLISHED", "REVIEWED_NO_REQUIREMENTS"].includes(c.regionalStatus)) &&
      (!c.review || !c.sourceIds.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Published coverage requires review and sources",
      });
  });
export const catalogueSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: text,
    releasedAt: date,
    sources: z.array(source),
    requirements: z.array(requirement),
    coverage: z.array(coverage),
  })
  .strict()
  .superRefine((v, c) => {
    const ids = new Set<string>();
    for (const s of v.sources) {
      if (ids.has(s.id))
        c.addIssue({ code: "custom", message: "Duplicate source" });
      ids.add(s.id);
    }
    const reqs = new Set<string>();
    for (const r of v.requirements) {
      const key = `${r.id}:${r.version}`;
      if (reqs.has(key))
        c.addIssue({
          code: "custom",
          message: "Duplicate requirement revision",
        });
      reqs.add(key);
      for (const id of r.sourceIds) {
        const s = v.sources.find((s) => s.id === id);
        if (
          !s ||
          (r.state === "PUBLISHED" && s.state !== "REVIEWED") ||
          !s.territory.includes(r.jurisdiction)
        )
          c.addIssue({
            code: "custom",
            message: "Unreviewed, missing or out-of-territory source",
          });
      }
      if (
        r.supersedesVersion !== null &&
        (r.supersedesVersion >= r.version ||
          !v.requirements.some(
            (previous) =>
              previous.id === r.id && previous.version === r.supersedesVersion,
          ))
      )
        c.addIssue({ code: "custom", message: "Invalid supersession" });
    }
    const cells = new Set<string>();
    for (const cell of v.coverage) {
      const key = `${cell.jurisdiction}:${cell.sector}:${cell.topic}`;
      if (cells.has(key))
        c.addIssue({ code: "custom", message: "Duplicate coverage cell" });
      cells.add(key);
      for (const id of cell.sourceIds)
        if (
          !v.sources.some(
            (source) =>
              source.id === id &&
              (!["PUBLISHED", "REVIEWED_NO_REQUIREMENTS"].includes(
                cell.status,
              ) ||
                source.state === "REVIEWED") &&
              source.territory.includes(cell.jurisdiction),
          )
        )
          c.addIssue({ code: "custom", message: "Dangling coverage source" });
    }
  });
export type TrackerCatalogue = z.infer<typeof catalogueSchema>;
export type CatalogueRequirement = TrackerCatalogue["requirements"][number];
