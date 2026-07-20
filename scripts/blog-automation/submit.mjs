#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

import { getArgValue, loadEnvFile, resolveEnvFile } from "../lib/env-file.mjs";
import {
  buildFinalReport,
  isRunnableLondonScheduleTime,
  validateBlogAutomationCandidate,
} from "./qa.mjs";

async function main() {
  const envFile = resolveEnvFile();
  const env = loadEnvFile(envFile);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  if (!getFlag("--ignore-schedule-window") && !isRunnableLondonScheduleTime()) {
    console.log("Published: no");
    console.log("Title: ");
    console.log("Slug: ");
    console.log("URL: ");
    console.log("Primary audience: ");
    console.log("Search intent: ");
    console.log("Primary keyword: ");
    console.log("Duplicate risk: ");
    console.log("Cannibalisation risk: ");
    console.log("Brand fit score: ");
    console.log("SEO score: ");
    console.log("Voice score: ");
    console.log("Usefulness score: ");
    console.log("Internal links used: ");
    console.log("Cover image: skipped");
    console.log("QA result: failed");
    console.log(
      "Notes: Not the configured Monday, Wednesday, Friday 6:00-6:29am Europe/London window.",
    );
    return;
  }

  const candidatePath = getArgValue("--candidate") ?? process.argv[2];
  if (!candidatePath) {
    throw new Error("Missing --candidate path");
  }

  const apiBaseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const token = process.env.PATHWAY_BLOG_AUTOMATION_TOKEN;
  if (!apiBaseUrl)
    throw new Error("NEXT_PUBLIC_API_URL or API_BASE_URL is required");
  if (!token) throw new Error("PATHWAY_BLOG_AUTOMATION_TOKEN is required");

  const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  const notes = [];
  try {
    candidate.existingPosts = await fetchExistingPosts(apiBaseUrl, token);
  } catch (error) {
    if (
      !Array.isArray(candidate.existingPosts) ||
      candidate.existingPosts.length === 0
    ) {
      throw error;
    }
    notes.push(
      `Existing-post API unavailable; using candidate embedded context: ${formatError(error)}`,
    );
  }

  const qaResult = validateBlogAutomationCandidate(candidate);
  notes.push(...qaResult.errors, ...qaResult.warnings);

  if (!qaResult.publishable && !qaResult.draftable) {
    console.log(
      buildFinalReport({
        candidate,
        status: "no",
        qaResult,
        coverImageStatus: "skipped",
        notes,
      }),
    );
    return;
  }

  let coverImageStatus = "skipped";
  if (qaResult.publishable && candidate.coverImage) {
    try {
      const uploaded = await uploadCoverImage(
        apiBaseUrl,
        token,
        candidate.coverImage,
      );
      candidate.post.headerImageId = uploaded.id;
      candidate.post.thumbnailImageId = uploaded.id;
      coverImageStatus = "uploaded";
    } catch (error) {
      delete candidate.post.headerImageId;
      delete candidate.post.thumbnailImageId;
      coverImageStatus = "failed";
      console.log(
        buildFinalReport({
          candidate,
          status: "no",
          qaResult,
          coverImageStatus,
          notes: [`Cover image upload failed: ${formatError(error)}`, ...notes],
        }),
      );
      return;
    }
  }

  if (getFlag("--dry-run")) {
    console.log(
      buildFinalReport({
        candidate,
        status: qaResult.publishable ? "yes" : "draft",
        qaResult,
        coverImageStatus,
        notes: ["Dry run only.", ...notes],
      }),
    );
    return;
  }

  const endpoint = qaResult.publishable
    ? "/automation/blog/posts"
    : "/automation/blog/drafts";
  const response = await postJson(apiBaseUrl, token, endpoint, candidate.post);
  const status = qaResult.publishable ? "yes" : "draft";
  const url =
    response.url ?? buildBlogUrl(response.slug ?? candidate.post.slug);

  console.log(
    buildFinalReport({
      candidate,
      status,
      url,
      qaResult,
      coverImageStatus,
      notes,
    }),
  );
}

async function fetchExistingPosts(apiBaseUrl, token) {
  const posts = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(
      "/automation/blog/posts",
      trimTrailingSlash(apiBaseUrl),
    );
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await requestJson(url, token);
    posts.push(...(Array.isArray(data.posts) ? data.posts : []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  return posts;
}

async function uploadCoverImage(apiBaseUrl, token, coverImage) {
  return postJson(apiBaseUrl, token, "/automation/blog/assets", {
    fileBase64: coverImage.fileBase64,
    mimeType: coverImage.mimeType,
    type: coverImage.type ?? "HEADER",
    width: coverImage.width,
    height: coverImage.height,
  });
}

async function postJson(apiBaseUrl, token, pathname, payload) {
  const url = new URL(pathname, trimTrailingSlash(apiBaseUrl));
  return requestJson(url, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function requestJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Blog automation API failed: ${response.status} ${body}`);
  }
  return response.json();
}

function buildBlogUrl(slug) {
  const baseUrl = process.env.PUBLIC_BLOG_BASE_URL ?? "https://nexsteps.dev";
  return `${trimTrailingSlash(baseUrl)}/blog/${slug}`;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getFlag(flag) {
  return process.argv.includes(flag);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
