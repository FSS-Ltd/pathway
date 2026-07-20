const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function storageExtension(mimeType?: string | null): string {
  if (!mimeType) return "bin";
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? "bin";
}

export function childPhotoKey(
  tenantId: string,
  childId: string,
  mimeType: string,
): string {
  return `tenants/${tenantId}/children/${childId}/photo.${storageExtension(mimeType)}`;
}

export function staffAvatarKey(
  tenantId: string,
  userId: string,
  mimeType: string,
): string {
  return `tenants/${tenantId}/staff/${userId}/avatar.${storageExtension(mimeType)}`;
}

export function orgLogoKey(orgId: string, mimeType: string): string {
  return `orgs/${orgId}/logo.${storageExtension(mimeType)}`;
}

export function lessonResourceKey(
  tenantId: string,
  lessonId: string,
  fileName: string,
): string {
  return `tenants/${tenantId}/lessons/${lessonId}/resources/${sanitizeStorageSegment(fileName)}`;
}

export function reportBundleKey(tenantId: string, bundleId: string): string {
  return `tenants/${tenantId}/reports/${bundleId}/bundle.csv`;
}

export function blogAssetKey(sha256: string, mimeType: string): string {
  return `blog/assets/${sha256}.${storageExtension(mimeType)}`;
}

function sanitizeStorageSegment(value: string): string {
  const sanitized = value.trim().replace(/[^\w.-]/g, "_");
  return sanitized.length > 0 ? sanitized : "resource";
}
