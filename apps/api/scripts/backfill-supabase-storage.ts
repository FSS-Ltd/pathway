import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "@pathway/db";
import { SupabaseStorageService } from "../src/common/storage/supabase-storage.service";
import {
  blogAssetKey,
  childPhotoKey,
  lessonResourceKey,
  staffAvatarKey,
} from "../src/common/storage/storage-key.util";

const apply = process.argv.includes("--apply");
const storage = new SupabaseStorageService();

type BackfillResult = {
  scanned: number;
  uploaded: number;
  skipped: number;
};

async function main(): Promise<void> {
  if (!storage.isConfigured()) {
    throw new Error(
      "Supabase Storage env is incomplete. Set SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_STORAGE_PRIVATE_BUCKET, and SUPABASE_STORAGE_PUBLIC_BUCKET.",
    );
  }

  console.log(
    `[storage-backfill] mode=${apply ? "apply" : "dry-run"}; pass --apply to upload and clear verified DB bytes.`,
  );

  const results = {
    children: await backfillChildPhotos(),
    staff: await backfillStaffAvatars(),
    lessons: await backfillLessonResources(),
    blogAssets: await backfillBlogAssets(),
  };

  console.log(JSON.stringify(results, null, 2));
}

async function backfillChildPhotos(): Promise<BackfillResult> {
  const rows = await prisma.child.findMany({
    where: {
      photoBytes: { not: null },
      photoConsent: true,
      photoKey: null,
    },
    select: {
      id: true,
      tenantId: true,
      photoBytes: true,
      photoContentType: true,
    },
  });

  const result = emptyResult(rows.length);
  for (const row of rows) {
    if (!row.photoBytes) {
      result.skipped += 1;
      continue;
    }
    const contentType = row.photoContentType ?? "image/jpeg";
    const buffer = Buffer.from(row.photoBytes);
    const key = childPhotoKey(row.tenantId, row.id, contentType);
    if (!apply) {
      result.skipped += 1;
      continue;
    }
    const uploaded = await uploadAndVerify("private", key, buffer, contentType);
    await prisma.child.update({
      where: { id: row.id },
      data: {
        photoKey: uploaded.key,
        photoBytes: null,
        photoContentType: contentType,
      },
    });
    result.uploaded += 1;
  }
  return result;
}

async function backfillStaffAvatars(): Promise<BackfillResult> {
  const rows = await prisma.user.findMany({
    where: {
      avatarBytes: { not: null },
      avatarKey: null,
    },
    select: {
      id: true,
      tenantId: true,
      lastActiveTenantId: true,
      avatarBytes: true,
      avatarContentType: true,
    },
  });

  const result = emptyResult(rows.length);
  for (const row of rows) {
    if (!row.avatarBytes) {
      result.skipped += 1;
      continue;
    }
    const tenantId = row.lastActiveTenantId ?? row.tenantId;
    if (!tenantId) {
      result.skipped += 1;
      continue;
    }
    const contentType = row.avatarContentType ?? "image/jpeg";
    const buffer = Buffer.from(row.avatarBytes);
    const key = staffAvatarKey(tenantId, row.id, contentType);
    if (!apply) {
      result.skipped += 1;
      continue;
    }
    const uploaded = await uploadAndVerify("private", key, buffer, contentType);
    await prisma.user.update({
      where: { id: row.id },
      data: {
        avatarKey: uploaded.key,
        avatarBytes: null,
        avatarContentType: contentType,
      },
    });
    result.uploaded += 1;
  }
  return result;
}

async function backfillLessonResources(): Promise<BackfillResult> {
  const rows = await prisma.lesson.findMany({
    where: {
      resourceFileBytes: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      fileKey: true,
      resourceFileBytes: true,
      resourceFileName: true,
    },
  });

  const result = emptyResult(rows.length);
  for (const row of rows) {
    if (!row.resourceFileBytes) {
      result.skipped += 1;
      continue;
    }
    const fileName = row.resourceFileName ?? "resource";
    const buffer = Buffer.from(row.resourceFileBytes);
    const key =
      row.fileKey && row.fileKey.includes("/")
        ? row.fileKey
        : lessonResourceKey(row.tenantId, row.id, fileName);
    if (!apply) {
      result.skipped += 1;
      continue;
    }
    const uploaded = await uploadAndVerify(
      "private",
      key,
      buffer,
      "application/octet-stream",
    );
    await prisma.lesson.update({
      where: { id: row.id },
      data: {
        fileKey: uploaded.key,
        resourceFileBytes: null,
        resourceFileName: fileName,
      },
    });
    result.uploaded += 1;
  }
  return result;
}

async function backfillBlogAssets(): Promise<BackfillResult> {
  const rows = await prisma.blogAsset.findMany({
    where: {
      bytes: { not: null },
      storageKey: null,
    },
    select: {
      id: true,
      bytes: true,
      mimeType: true,
      sha256: true,
    },
  });

  const result = emptyResult(rows.length);
  for (const row of rows) {
    if (!row.bytes) {
      result.skipped += 1;
      continue;
    }
    const buffer = Buffer.from(row.bytes);
    const key = blogAssetKey(row.sha256, row.mimeType);
    if (!apply) {
      result.skipped += 1;
      continue;
    }
    const uploaded = await uploadAndVerify("public", key, buffer, row.mimeType);
    await prisma.blogAsset.update({
      where: { id: row.id },
      data: {
        storage: "SUPABASE",
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        bytes: null,
      },
    });
    result.uploaded += 1;
  }
  return result;
}

async function uploadAndVerify(
  bucket: "private" | "public",
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ bucket: string; key: string }> {
  const uploaded = await storage.uploadObject({
    bucket,
    key,
    body: buffer,
    contentType,
  });
  if (!uploaded) {
    throw new Error("Supabase Storage is not configured");
  }

  const downloaded = await storage.downloadObject(
    uploaded.bucket,
    uploaded.key,
  );
  if (!downloaded) {
    throw new Error(
      `Uploaded object could not be downloaded for verification: ${key}`,
    );
  }
  if (
    downloaded.length !== buffer.length ||
    sha256(downloaded) !== sha256(buffer)
  ) {
    throw new Error(`Uploaded object failed checksum verification: ${key}`);
  }
  return uploaded;
}

function emptyResult(scanned: number): BackfillResult {
  return { scanned, uploaded: 0, skipped: 0 };
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
