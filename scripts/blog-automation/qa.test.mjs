import assert from "node:assert/strict";
import test from "node:test";

import {
  extractInternalLinks,
  isRunnableLondonScheduleTime,
  validateBlogAutomationCandidate,
} from "./qa.mjs";

const validContentJson = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [
        {
          type: "text",
          text: "Connected operations software for church youth teams",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Connected operations software for church youth teams matters when attendance, volunteers, family updates, and follow-up all live in different places.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        { type: "text", text: "What connected operations software changes" },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "See how " },
        {
          type: "text",
          text: "teams and scheduling",
          marks: [
            { type: "link", attrs: { href: "/features/teams-scheduling" } },
          ],
        },
        { type: "text", text: " connect with " },
        {
          type: "text",
          text: "safeguarding workflows",
          marks: [{ type: "link", attrs: { href: "/features/safeguarding" } }],
        },
        { type: "text", text: "." },
      ],
    },
  ],
};

function candidate(overrides = {}) {
  return {
    post: {
      title: "Connected operations software for church youth teams",
      slug: "connected-operations-software-church-youth-teams",
      excerpt:
        "Church youth teams lose time when attendance, volunteers, family updates, and follow-up sit in separate tools.",
      seoTitle: "Connected Operations Software for Church Youth Teams",
      seoDescription:
        "How church youth teams can replace disconnected registers, rotas, updates, and follow-up with one connected operations workflow.",
      tags: ["churches", "youth teams", "operations"],
      contentJson: validContentJson,
    },
    topicLedger: {
      proposedTitle: "Connected operations software for church youth teams",
      proposedSlug: "connected-operations-software-church-youth-teams",
      primaryAudience: "church children and youth teams",
      searchIntent: "category-building",
      primaryKeyword: "connected operations software for church youth teams",
      secondaryKeywords: ["church youth team software", "volunteer scheduling"],
      buyerPain:
        "Registers, rotas, family updates, and follow-up live in separate places.",
      NexstepsAngle:
        "Nexsteps connects attendance, teams, family communication, and safeguarding.",
      internalPageToSupport: "/churches",
      duplicateRisk: "low",
      cannibalisationRisk: "low",
      reasonThisPostShouldExist:
        "It speaks to church youth leaders without duplicating the existing after-school club attendance post.",
    },
    qa: {
      confidenceScore: 0.94,
      duplicateRisk: "low",
      cannibalisationRisk: "low",
      complianceRisk: "low",
      factualRisk: "low",
      brandFitScore: 0.94,
      voiceScore: 0.93,
      seoScore: 0.89,
      usefulnessScore: 0.9,
    },
    existingPosts: [
      {
        slug: "attendance-tracking-software-after-school-clubs",
        title:
          "Attendance tracking software for after-school clubs: what to look for",
      },
    ],
    coverImage: {
      fileBase64: Buffer.from("image").toString("base64"),
      mimeType: "image/png",
      type: "HEADER",
      width: 1200,
      height: 630,
      altText:
        "Church youth team dashboard showing attendance and team scheduling.",
      generatedBy: "codex:image_gen",
    },
    ...overrides,
  };
}

test("extractInternalLinks returns contextual relative links from TipTap marks", () => {
  assert.deepEqual(extractInternalLinks(validContentJson), [
    "/features/teams-scheduling",
    "/features/safeguarding",
  ]);
});

test("validateBlogAutomationCandidate passes a complete publish-ready candidate", () => {
  const result = validateBlogAutomationCandidate(candidate());

  assert.equal(result.publishable, true);
  assert.deepEqual(result.errors, []);
});

test("validateBlogAutomationCandidate blocks duplicate slugs", () => {
  const result = validateBlogAutomationCandidate(
    candidate({
      existingPosts: [
        {
          slug: "connected-operations-software-church-youth-teams",
          title: "Existing",
        },
      ],
    }),
  );

  assert.equal(result.publishable, false);
  assert.match(result.errors.join("\n"), /slug already exists/i);
});

test("validateBlogAutomationCandidate fails publish gates but allows draft when scores are low", () => {
  const result = validateBlogAutomationCandidate(
    candidate({
      qa: {
        ...candidate().qa,
        seoScore: 0.7,
      },
    }),
  );

  assert.equal(result.publishable, false);
  assert.equal(result.draftable, true);
  assert.match(result.errors.join("\n"), /seoScore/i);
});

test("validateBlogAutomationCandidate requires a cover image before publishing", () => {
  const result = validateBlogAutomationCandidate(
    candidate({
      coverImage: undefined,
    }),
  );

  assert.equal(result.publishable, false);
  assert.equal(result.draftable, false);
  assert.match(result.errors.join("\n"), /coverImage is required/i);
});

test("validateBlogAutomationCandidate accepts namespaced image generator provenance", () => {
  const result = validateBlogAutomationCandidate(
    candidate({
      coverImage: {
        fileBase64: Buffer.from("image").toString("base64"),
        mimeType: "image/png",
        type: "HEADER",
        width: 1200,
        height: 630,
        altText:
          "Church youth team dashboard showing attendance and team scheduling.",
        generatedBy: "fal:imagen",
      },
    }),
  );

  assert.equal(result.publishable, true);
  assert.deepEqual(result.errors, []);
});

test("validateBlogAutomationCandidate rejects cover images without namespaced generator provenance", () => {
  const result = validateBlogAutomationCandidate(
    candidate({
      coverImage: {
        fileBase64: Buffer.from("image").toString("base64"),
        mimeType: "image/png",
        type: "HEADER",
        width: 1200,
        height: 630,
        altText:
          "Church youth team dashboard showing attendance and team scheduling.",
        generatedBy: "remote-image-provider",
      },
    }),
  );

  assert.equal(result.publishable, false);
  assert.match(result.errors.join("\n"), /namespaced generator provenance/i);
});

test("isRunnableLondonScheduleTime accepts 6:00 through 6:29 Europe/London on Monday, Wednesday, or Friday", () => {
  assert.equal(
    isRunnableLondonScheduleTime(new Date("2026-06-17T05:00:00.000Z")),
    true,
  );
  assert.equal(
    isRunnableLondonScheduleTime(new Date("2026-06-17T05:29:00.000Z")),
    true,
  );
  assert.equal(
    isRunnableLondonScheduleTime(new Date("2026-06-17T05:30:00.000Z")),
    false,
  );
  assert.equal(
    isRunnableLondonScheduleTime(new Date("2026-06-17T06:00:00.000Z")),
    false,
  );
  assert.equal(
    isRunnableLondonScheduleTime(new Date("2026-06-18T05:00:00.000Z")),
    false,
  );
});
