const REQUIRED_LEDGER_FIELDS = [
  "proposedTitle",
  "proposedSlug",
  "primaryAudience",
  "searchIntent",
  "primaryKeyword",
  "secondaryKeywords",
  "buyerPain",
  "NexstepsAngle",
  "internalPageToSupport",
  "duplicateRisk",
  "cannibalisationRisk",
  "reasonThisPostShouldExist",
];

const REQUIRED_POST_FIELDS = [
  "title",
  "slug",
  "excerpt",
  "seoTitle",
  "seoDescription",
  "tags",
  "contentJson",
];

const SCORE_THRESHOLDS = {
  confidenceScore: 0.9,
  brandFitScore: 0.9,
  voiceScore: 0.9,
  seoScore: 0.85,
  usefulnessScore: 0.85,
};

const LOW_RISK_FIELDS = [
  "duplicateRisk",
  "cannibalisationRisk",
  "complianceRisk",
  "factualRisk",
];

const ALLOWED_INTERNAL_LINKS = new Set([
  "/features/attendance",
  "/features/teams-scheduling",
  "/features/family-communication",
  "/features/safeguarding",
  "/features/reporting",
  "/schools",
  "/clubs",
  "/churches",
  "/charities",
  "/security",
  "/pricing",
  "/demo",
  "/trial",
  "/readiness-score",
  "/toolkit",
]);

const BANNED_PHRASES = [
  "in today's world",
  "as we know",
  "at the end of the day",
  "moving forward",
  "leverage",
  "synergies",
  "paradigm shift",
  "sets the stage",
  "in conclusion",
  "overall",
  "to summarise",
  "additionally",
  "align with",
  "boasts",
  "bolstered",
  "crucial",
  "delve",
  "emphasizing",
  "enduring",
  "enhance",
  "fostering",
  "garner",
  "interplay",
  "intricate",
  "pivotal",
  "showcase",
  "tapestry",
  "testament",
  "underscore",
  "valuable",
  "vibrant",
  "groundbreaking",
  "renowned",
  "diverse array",
  "rich heritage",
  "natural beauty",
  "commitment to",
];

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const IMAGE_GENERATOR_PROVENANCE_PATTERN =
  /^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateBlogAutomationCandidate(candidate) {
  const errors = [];
  const warnings = [];
  const severeErrors = [];

  const post = candidate?.post;
  const topicLedger = candidate?.topicLedger;
  const qa = candidate?.qa;
  const existingPosts = Array.isArray(candidate?.existingPosts)
    ? candidate.existingPosts
    : [];

  if (!post || typeof post !== "object") {
    errors.push("post is required");
    severeErrors.push("post is required");
    return result(errors, warnings, severeErrors, []);
  }

  if (!topicLedger || typeof topicLedger !== "object") {
    errors.push("topicLedger is required");
  }

  if (!qa || typeof qa !== "object") {
    errors.push("qa is required");
  }

  for (const field of REQUIRED_POST_FIELDS) {
    if (!hasValue(post[field])) {
      errors.push(`post.${field} is required`);
      if (field === "contentJson")
        severeErrors.push(`post.${field} is required`);
    }
  }

  if (post.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
    errors.push("post.slug must be lowercase alphanumeric with hyphens");
    severeErrors.push("post.slug is invalid");
  }

  if (existingPosts.some((existing) => existing?.slug === post.slug)) {
    errors.push(`slug already exists: ${post.slug}`);
    severeErrors.push(`slug already exists: ${post.slug}`);
  }

  if (topicLedger) {
    for (const field of REQUIRED_LEDGER_FIELDS) {
      if (!hasValue(topicLedger[field])) {
        errors.push(`topicLedger.${field} is required`);
      }
    }
  }

  if (!isTipTapDoc(post.contentJson)) {
    errors.push("post.contentJson must be a TipTap doc with content");
    severeErrors.push("post.contentJson is invalid");
  }

  if (Array.isArray(post.tags) && post.tags.length === 0) {
    errors.push("post.tags must include at least one tag");
  }

  const plainText = extractPlainText(post.contentJson);
  const openingText = extractOpeningParagraphText(post.contentJson);
  const primaryKeyword = String(topicLedger?.primaryKeyword ?? "").trim();

  if (plainText.includes("—")) {
    errors.push("content contains an em dash");
  }

  for (const phrase of BANNED_PHRASES) {
    if (
      containsPhrase(plainText, phrase) ||
      containsPhrase(post.title, phrase)
    ) {
      errors.push(`content contains banned phrase: ${phrase}`);
    }
  }

  if (primaryKeyword) {
    const titleOrH1 = `${post.title ?? ""} ${extractHeadings(post.contentJson, 1).join(" ")}`;
    if (!containsPhrase(titleOrH1, primaryKeyword)) {
      errors.push("primary keyword must appear naturally in title or H1");
    }
    if (!containsPhrase(openingText, primaryKeyword)) {
      errors.push(
        "primary keyword must appear naturally in the opening section",
      );
    }
    const h2Text = extractHeadings(post.contentJson, 2).join(" ");
    if (!containsPhrase(h2Text, primaryKeyword)) {
      warnings.push(
        "primary keyword does not appear in an H2; acceptable only if unnatural",
      );
    }
  }

  const internalLinksUsed = extractInternalLinks(post.contentJson).filter(
    (href) => ALLOWED_INTERNAL_LINKS.has(stripUrlSuffix(href)),
  );
  if (new Set(internalLinksUsed.map(stripUrlSuffix)).size < 2) {
    errors.push("post must include at least 2 relevant internal links");
  }

  if (qa) {
    for (const [field, threshold] of Object.entries(SCORE_THRESHOLDS)) {
      if (typeof qa[field] !== "number" || qa[field] < threshold) {
        errors.push(`qa.${field} must be at least ${threshold}`);
      }
    }
    for (const field of LOW_RISK_FIELDS) {
      if (qa[field] !== "low") {
        errors.push(`qa.${field} must be low`);
      }
    }
  }

  if (topicLedger?.duplicateRisk && topicLedger.duplicateRisk !== "low") {
    errors.push("topicLedger.duplicateRisk must be low");
  }
  if (
    topicLedger?.cannibalisationRisk &&
    topicLedger.cannibalisationRisk !== "low"
  ) {
    errors.push("topicLedger.cannibalisationRisk must be low");
  }

  validateCoverImage(candidate?.coverImage, errors, severeErrors);

  return result(errors, warnings, severeErrors, internalLinksUsed);
}

export function extractInternalLinks(contentJson) {
  const links = [];
  walkTipTap(contentJson, (node) => {
    for (const mark of node?.marks ?? []) {
      if (mark?.type !== "link") continue;
      const href = mark.attrs?.href;
      if (typeof href !== "string") continue;
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      if (!links.includes(href)) links.push(href);
    }
  });
  return links;
}

export function extractPlainText(contentJson) {
  const chunks = [];
  walkTipTap(contentJson, (node) => {
    if (node?.type === "text" && typeof node.text === "string") {
      chunks.push(node.text);
    }
  });
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export function isRunnableLondonScheduleTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return (
    ["Mon", "Wed", "Fri"].includes(values.weekday) &&
    values.hour === "06" &&
    Number(values.minute) >= 0 &&
    Number(values.minute) <= 29
  );
}

export function buildFinalReport({
  candidate,
  status,
  url,
  qaResult,
  coverImageStatus = "skipped",
  notes = [],
}) {
  const post = candidate?.post ?? {};
  const ledger = candidate?.topicLedger ?? {};
  const qa = candidate?.qa ?? {};
  const links = qaResult?.internalLinksUsed?.length
    ? qaResult.internalLinksUsed
    : extractInternalLinks(post.contentJson);
  const noteText = notes.filter(Boolean).join(" ");

  return [
    `Published: ${status}`,
    `Title: ${post.title ?? ""}`,
    `Slug: ${post.slug ?? ""}`,
    `URL: ${url ?? ""}`,
    `Primary audience: ${ledger.primaryAudience ?? ""}`,
    `Search intent: ${ledger.searchIntent ?? ""}`,
    `Primary keyword: ${ledger.primaryKeyword ?? ""}`,
    `Duplicate risk: ${qa.duplicateRisk ?? ledger.duplicateRisk ?? ""}`,
    `Cannibalisation risk: ${qa.cannibalisationRisk ?? ledger.cannibalisationRisk ?? ""}`,
    `Brand fit score: ${formatScore(qa.brandFitScore)}`,
    `SEO score: ${formatScore(qa.seoScore)}`,
    `Voice score: ${formatScore(qa.voiceScore)}`,
    `Usefulness score: ${formatScore(qa.usefulnessScore)}`,
    `Internal links used: ${links.join(", ")}`,
    `Cover image: ${coverImageStatus}`,
    `QA result: ${qaResult?.publishable ? "passed" : "failed"}`,
    `Notes: ${noteText}`,
  ].join("\n");
}

function validateCoverImage(coverImage, errors, severeErrors) {
  if (coverImage == null) {
    errors.push("coverImage is required");
    severeErrors.push("coverImage is required");
    return;
  }
  if (typeof coverImage !== "object") {
    errors.push("coverImage must be an object when provided");
    severeErrors.push("coverImage is invalid");
    return;
  }

  if (
    typeof coverImage.generatedBy !== "string" ||
    !IMAGE_GENERATOR_PROVENANCE_PATTERN.test(coverImage.generatedBy)
  ) {
    errors.push("cover image must include namespaced generator provenance");
    severeErrors.push("cover image generator provenance is invalid");
  }
  if (!hasValue(coverImage.altText)) {
    errors.push("coverImage.altText is required");
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(coverImage.mimeType)) {
    errors.push(
      "coverImage.mimeType must be image/png, image/jpeg, or image/webp",
    );
    severeErrors.push("coverImage.mimeType is invalid");
  }
  if (!hasValue(coverImage.fileBase64)) {
    errors.push("coverImage.fileBase64 is required");
    severeErrors.push("coverImage.fileBase64 is missing");
  }
}

function result(errors, warnings, severeErrors, internalLinksUsed) {
  return {
    publishable: errors.length === 0,
    draftable: severeErrors.length === 0,
    errors,
    warnings,
    internalLinksUsed,
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isTipTapDoc(contentJson) {
  return (
    contentJson != null &&
    typeof contentJson === "object" &&
    contentJson.type === "doc" &&
    Array.isArray(contentJson.content) &&
    contentJson.content.length > 0
  );
}

function extractOpeningParagraphText(contentJson) {
  const paragraph = contentJson?.content?.find(
    (node) => node?.type === "paragraph",
  );
  return extractPlainText(paragraph);
}

function extractHeadings(contentJson, level) {
  const headings = [];
  walkTipTap(contentJson, (node) => {
    if (node?.type === "heading" && node.attrs?.level === level) {
      headings.push(extractPlainText(node));
    }
  });
  return headings;
}

function walkTipTap(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) {
    walkTipTap(child, visit);
  }
}

function containsPhrase(text, phrase) {
  if (!text || !phrase) return false;
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function stripUrlSuffix(href) {
  return href.split(/[?#]/, 1)[0];
}

function formatScore(score) {
  return typeof score === "number" ? score.toFixed(2) : "";
}
