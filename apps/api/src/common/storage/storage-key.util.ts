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

export function dataExportKey(tenantId: string, requestId: string): string {
  return `tenants/${tenantId}/privacy-exports/${requestId}/export.zip`;
}

export function messageAttachmentKey(
  tenantId: string,
  messageId: string,
  fileName: string,
): string {
  return `tenants/${tenantId}/messages/${messageId}/${sanitizeStorageSegment(fileName)}`;
}

export function noticeAttachmentKey(
  tenantId: string,
  noticeId: string,
  fileName: string,
): string {
  return `tenants/${tenantId}/notices/${noticeId}/${sanitizeStorageSegment(fileName)}`;
}

export function homeworkEvidenceKey(
  tenantId: string,
  recipientId: string,
  evidenceId: string,
  mimeType: "application/pdf" | "image/png" | "image/jpeg",
  phase: "upload" | "clean",
): string {
  return `tenants/${tenantId}/homework/${recipientId}/${evidenceId}/${phase}.${storageExtension(mimeType)}`;
}

/** Private buckets may only receive tenant-isolated classes registered here. */
export function isPrivateStorageKey(key: string): boolean {
  return /^tenants\/[^/]+\/(?:children\/[^/]+\/photo\.[^/]+|staff\/[^/]+\/avatar\.[^/]+|lessons\/[^/]+\/resources\/[^/]+|reports\/[^/]+\/bundle\.csv|privacy-exports\/[^/]+\/export\.zip|messages\/[^/]+\/[^/]+|notices\/[^/]+\/[^/]+|homework\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(?:upload|clean)\.(?:pdf|png|jpg)|(?:agreements|compliance-evidence)\/[0-9a-f-]{36}\/document\.pdf|finance-statements\/[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf|finance-documents\/[0-9a-f-]{36}\/(?:invoice|credit-note|receipt)\.pdf)$/.test(
    key,
  );
}

export function blogAssetKey(sha256: string, mimeType: string): string {
  return `blog/assets/${sha256}.${storageExtension(mimeType)}`;
}

function sanitizeStorageSegment(value: string): string {
  const sanitized = value.trim().replace(/[^\w.-]/g, "_");
  return sanitized.length > 0 ? sanitized : "resource";
}

export function financeStatementStorageKey(
  tenantId: string,
  statementId: string,
  sha256: string,
): string {
  return `tenants/${tenantId}/finance-statements/${statementId}/${sha256}.pdf`;
}

export function financeDocumentStorageKey(
  tenantId: string,
  kind: "invoice" | "credit-note" | "receipt",
  documentId: string,
): string {
  return `tenants/${tenantId}/finance-documents/${documentId}/${kind}.pdf`;
}
