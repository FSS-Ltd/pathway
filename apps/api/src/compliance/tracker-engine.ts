import { currentSource } from "./catalogue/current";
import {
  TRACKER_TOPICS,
  type TrackerProfile,
  type TrackerProfileInput,
  type TrackerApplicability,
  type TrackerAttestation,
  type TrackerChecklist,
  type TrackerChecklistItem,
  type TrackerProgress,
  type TrackerRequirement,
  type TrackerCoverage,
} from "@pathway/types";
import type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./catalogue";
export interface TrackerLocation {
  countryCode: string | null;
  subdivisionCode: string | null;
  jurisdictionCodes?: string[];
}
export function evaluateCondition(
  condition: Condition | null,
  profile: TrackerProfileInput,
  location: TrackerLocation,
): TrackerApplicability {
  if (!condition) return "APPLICABLE";
  if ("not" in condition) {
    const result = evaluateCondition(condition.not, profile, location);
    return result === "UNRESOLVED"
      ? result
      : result === "APPLICABLE"
        ? "NOT_APPLICABLE"
        : "APPLICABLE";
  }
  if ("all" in condition || "any" in condition) {
    const all = "all" in condition;
    const children = all ? condition.all : condition.any;
    const results = children.map((child) =>
      evaluateCondition(child, profile, location),
    );
    const decisive = all ? "NOT_APPLICABLE" : "APPLICABLE";
    if (results.includes(decisive)) return decisive;
    return results.includes("UNRESOLVED")
      ? "UNRESOLVED"
      : all
        ? "APPLICABLE"
        : "NOT_APPLICABLE";
  }
  const value =
    condition.field === "countryCode" || condition.field === "subdivisionCode"
      ? location[condition.field]
      : profile[condition.field];
  if (value === null || value === undefined) return "UNRESOLVED";
  if (
    (condition.field === "countryCode" ||
      condition.field === "subdivisionCode") &&
    value === ""
  )
    return "UNRESOLVED";
  const matches =
    condition.op === "eq"
      ? value === condition.value
      : typeof value === "number" &&
        (condition.op === "gte"
          ? value >= condition.value
          : value <= condition.value);
  return matches ? "APPLICABLE" : "NOT_APPLICABLE";
}
function recordedValue(
  field: string,
  profile: TrackerProfileInput,
  location: TrackerLocation,
): string | number | boolean | null | undefined {
  if (field === "countryCode" || field === "subdivisionCode")
    return location[field];
  return profile[field as keyof TrackerProfileInput];
}

function factLabel(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function displayFact(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ").toLowerCase();
}

function nonApplicabilityReason(
  condition: Condition,
  profile: TrackerProfileInput,
  location: TrackerLocation,
): string {
  if ("all" in condition) {
    const mismatch = condition.all.find(
      (child) =>
        evaluateCondition(child, profile, location) === "NOT_APPLICABLE",
    );
    return mismatch
      ? nonApplicabilityReason(mismatch, profile, location)
      : "The recorded site facts do not meet every condition.";
  }
  if ("any" in condition)
    return condition.any
      .map((child) => nonApplicabilityReason(child, profile, location))
      .join("; ");
  if ("not" in condition)
    return `This action excludes sites matching the recorded ${"field" in condition.not ? factLabel(condition.not.field) : "provision"}.`;
  const actual = recordedValue(condition.field, profile, location);
  if (actual === null || actual === undefined)
    return "A required site fact is unknown.";
  const relation =
    condition.op === "eq"
      ? "requires"
      : condition.op === "gte"
        ? "requires at least"
        : "requires at most";
  return `Recorded ${factLabel(condition.field)}: ${displayFact(actual)}; this action ${relation} ${displayFact(condition.value)}.`;
}
const day = (now: Date): string => now.toISOString().slice(0, 10);
function current(
  r: CatalogueRequirement,
  catalogue: TrackerCatalogue,
  now: Date,
): boolean {
  const today = day(now);
  return (
    catalogue.releasedAt <= today &&
    r.state === "PUBLISHED" &&
    r.effective.from <= today &&
    (!r.effective.to || r.effective.to >= today) &&
    r.review.verifiedAt <= today &&
    r.review.reviewDueAt >= today &&
    r.sourceIds.every((id) => {
      const source = catalogue.sources.find((s) => s.id === id);
      return currentSource(source, today);
    })
  );
}
export function getCurrentRequirement(
  catalogue: TrackerCatalogue,
  id: string,
  version: number,
  now: Date,
): CatalogueRequirement | null {
  const versions = catalogue.requirements.filter(
    (r) => r.id === id && r.effective.from <= day(now),
  );
  const latest = versions.reduce<CatalogueRequirement | null>(
    (a, r) => (!a || r.version > a.version ? r : a),
    null,
  );
  return latest?.version === version && current(latest, catalogue, now)
    ? latest
    : null;
}
export function requirementSnapshot(
  r: CatalogueRequirement,
  catalogue: TrackerCatalogue,
): TrackerRequirement {
  return {
    id: r.id,
    version: r.version,
    action: r.action,
    topic: r.topic,
    obligationClass: r.obligationClass,
    applicabilityExplanation: r.applicabilityExplanation,
    unknownExplanation: r.unknownExplanation,
    expectedEvidence: r.expectedEvidence,
    allowsNotApplicable: r.allowsNotApplicable,
    signalKeys: r.signalKeys,
    sources: r.sourceIds.flatMap((id) => {
      const source = catalogue.sources.find((s) => s.id === id);
      return source
        ? [
            {
              id: source.id,
              url: source.url,
              title: source.title,
              authority: source.authority,
              provision: source.provision,
            },
          ]
        : [];
    }),
  };
}
function progress(items: TrackerChecklistItem[]): TrackerProgress {
  const result: TrackerProgress = {
    completed: 0,
    applicable: 0,
    notApplicable: 0,
    unresolved: 0,
    stale: 0,
    overdue: 0,
    evidenceGaps: 0,
  };
  for (const item of items) {
    if (item.applicability === "UNRESOLVED") {
      result.unresolved++;
      continue;
    }
    if (item.applicability === "NOT_APPLICABLE") {
      result.notApplicable++;
      continue;
    }
    const override =
      item.requirement.allowsNotApplicable &&
      !item.stale &&
      !item.overdue &&
      item.attestation?.status === "NOT_APPLICABLE" &&
      !!item.attestation.notApplicableReason?.trim();
    if (override) {
      result.notApplicable++;
      continue;
    }
    result.applicable++;
    if (item.completed) result.completed++;
    if (item.stale) result.stale++;
    if (item.overdue) result.overdue++;
    if (item.evidenceGap) result.evidenceGaps++;
  }
  return result;
}
export interface TrackerEngineInput {
  catalogue: TrackerCatalogue;
  profile: TrackerProfile | null;
  sectorOverride?: TrackerProfileInput["sector"];
  forceStale?: boolean;
  location: TrackerLocation;
  attestations: TrackerAttestation[];
  evidenceCounts: Record<string, number>;
  now: Date;
}
export function buildTrackerChecklist(
  input: TrackerEngineInput,
): TrackerChecklist {
  const {
    catalogue,
    profile,
    location,
    attestations,
    evidenceCounts,
    now,
    sectorOverride,
    forceStale,
  } = input;
  const jurisdiction =
    location.countryCode === "GB"
      ? location.subdivisionCode
      : location.countryCode;
  const sector =
    profile?.profile.vertical === "NURSERY"
      ? "NURSERY"
      : (sectorOverride ?? profile?.profile.sector ?? null);
  const jurisdictions: (string | null)[] = [
    ...new Set([
      jurisdiction,
      ...(location.jurisdictionCodes ?? []).filter((code) => code !== "GB"),
    ]),
  ];
  if (
    location.countryCode !== "GB" &&
    location.subdivisionCode &&
    location.subdivisionCode !== jurisdiction
  )
    if (!jurisdictions.includes(location.subdivisionCode))
      jurisdictions.push(location.subdivisionCode);
  const coverage: TrackerCoverage[] = jurisdictions.flatMap((jurisdiction) =>
    TRACKER_TOPICS.map((topic) => {
      const cell = catalogue.coverage.find(
        (c) =>
          c.jurisdiction === jurisdiction &&
          c.sector === sector &&
          c.topic === topic,
      );
      if (!cell)
        return {
          jurisdiction,
          sector,
          topic,
          status: "UNAVAILABLE",
          regionalStatus: "UNAVAILABLE",
          reason: !jurisdiction
            ? "Select an operating country and, for the UK, nation."
            : !sector
              ? "Select the institution sector."
              : "No reviewed pack is available for this jurisdiction and sector.",
        };
      let status = cell.status;
      let regionalStatus = cell.regionalStatus;
      let reason = cell.reason;
      if (
        location.countryCode === "BE" &&
        topic === "education_childcare" &&
        !profile?.profile.belgianEducationCommunity
      )
        reason +=
          " The education Community responsible for this provision is not recorded.";
      if (
        cell.review &&
        (cell.review.verifiedAt > day(now) ||
          cell.review.reviewDueAt < day(now) ||
          cell.sourceIds.some((id) => {
            const source = catalogue.sources.find((s) => s.id === id);
            return !currentSource(source, day(now));
          }))
      ) {
        status = "STALE";
        reason = "The source/applicability review is not current.";
      }
      const selectedSubjurisdiction = location.jurisdictionCodes?.some(
        (code) =>
          code.length > 0 &&
          code !== jurisdiction &&
          code !== location.countryCode &&
          (location.countryCode !== "GB" || code !== location.subdivisionCode),
      );
      if (
        cell.requiresRegion &&
        !selectedSubjurisdiction &&
        (!profile?.profile.region ||
          !cell.regions.includes(profile.profile.region))
      ) {
        regionalStatus = "UNAVAILABLE";
        reason += " Regional scope is missing or has not been reviewed.";
      }
      if (
        catalogue.requirements.some(
          (r) =>
            r.jurisdiction === jurisdiction &&
            sector !== null &&
            r.sectors.includes(sector) &&
            r.topic === topic &&
            !current(r, catalogue, now) &&
            r.effective.from <= day(now) &&
            !catalogue.requirements.some(
              (newer) =>
                newer.id === r.id &&
                newer.version > r.version &&
                current(newer, catalogue, now),
            ),
        )
      ) {
        status = "STALE";
        reason +=
          " Requirements or their sources are unavailable or out of review.";
      }
      return { jurisdiction, sector, topic, status, regionalStatus, reason };
    }),
  );
  const items: TrackerChecklistItem[] = profile
    ? catalogue.requirements
        .filter(
          (r) =>
            jurisdictions.includes(r.jurisdiction) &&
            sector !== null &&
            r.sectors.includes(sector) &&
            getCurrentRequirement(catalogue, r.id, r.version, now) !== null &&
            catalogue.coverage.some(
              (c) =>
                c.jurisdiction === r.jurisdiction &&
                c.sector === sector &&
                c.topic === r.topic &&
                (c.status === "PUBLISHED" ||
                  c.status === "PARTIALLY_PUBLISHED") &&
                c.review !== null &&
                c.review.verifiedAt <= day(now) &&
                c.review.reviewDueAt >= day(now) &&
                c.sourceIds.every((id) => {
                  const source = catalogue.sources.find(
                    (source) => source.id === id,
                  );
                  return currentSource(source, day(now));
                }),
            ),
        )
        .map((r) => {
          const attestation = attestations
            .filter((a) => a.requirementId === r.id)
            .reduce<TrackerAttestation | null>(
              (a, b) => (!a || b.revision > a.revision ? b : a),
              null,
            );
          const stale =
            !!attestation &&
            (forceStale === true ||
              attestation.requirementVersion !== r.version ||
              attestation.profileVersion !== profile.version);
          const overdue =
            !!attestation?.reviewDueAt &&
            attestation.reviewDueAt.slice(0, 10) < day(now);
          const applicability = evaluateCondition(
            r.condition,
            profile.profile,
            location,
          );
          const evidenceCount = evidenceCounts[`${r.id}:${r.version}`] ?? 0;
          return {
            requirement: requirementSnapshot(r, catalogue),
            applicability,
            applicabilityReason:
              applicability === "NOT_APPLICABLE" && r.condition
                ? nonApplicabilityReason(r.condition, profile.profile, location)
                : undefined,
            attestation,
            completed:
              applicability === "APPLICABLE" &&
              !stale &&
              !overdue &&
              attestation?.status === "COMPLETE",
            stale,
            overdue,
            evidenceCount,
            evidenceGap: evidenceCount === 0,
          };
        })
    : [];
  return {
    profile,
    items,
    progress: progress(items),
    categories: TRACKER_TOPICS.map((topic) => ({
      topic,
      ...progress(items.filter((i) => i.requirement.topic === topic)),
    })),
    coverage,
    coverageGaps: coverage.filter(
      (c) =>
        !["PUBLISHED", "REVIEWED_NO_REQUIREMENTS"].includes(c.status) ||
        !["PUBLISHED", "REVIEWED_NO_REQUIREMENTS"].includes(c.regionalStatus),
    ).length,
    observedAt: now.toISOString(),
  };
}
