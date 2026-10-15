import type {
  AgreementDocument,
  AgreementDocumentPage,
  AgreementVersionInput,
  AgreementVersionPage,
  AgreementAssignment,
  AgreementAssignmentPage,
  AgreementPeoplePage,
  AgreementPdfInput,
} from "@pathway/types";
import { apiFetch, API_BASE_URL } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
const base = `${API_BASE_URL}/compliance/agreements`;
async function request<T>(
  path: string,
  signal: AbortSignal,
  input?: unknown,
): Promise<T> {
  const response = await apiFetch(`${base}${path}`, {
    signal,
    cache: "no-store",
    method: input === undefined ? "GET" : "POST",
    headers:
      input === undefined ? undefined : { "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  if (response.status === 409)
    throw new Error(
      "This agreement changed or has already been accepted. Your draft is preserved. Review it before refreshing the list to load the current record.",
    );
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "The agreement request failed. Retry or refresh to check the latest version.",
    );
  return response.json();
}
const id = encodeURIComponent;
const cursorQuery = (cursor?: string) =>
  cursor ? `?cursor=${id(cursor)}` : "";
export const agreementsClient = {
  mine: (
    signal: AbortSignal,
    cursor?: string,
  ): Promise<AgreementAssignmentPage> =>
    request(`/mine${cursorQuery(cursor)}`, signal),
  documents: (
    signal: AbortSignal,
    cursor?: string,
  ): Promise<AgreementDocumentPage> =>
    request(`/documents${cursorQuery(cursor)}`, signal),
  versions: (
    documentId: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<AgreementVersionPage> =>
    request(
      `/documents/${id(documentId)}/versions${cursorQuery(cursor)}`,
      signal,
    ),
  publish: (
    input: AgreementVersionInput,
    signal: AbortSignal,
    document?: AgreementDocument,
  ): Promise<AgreementDocument> =>
    request(
      document ? `/documents/${id(document.id)}/versions` : "/documents",
      signal,
      document
        ? { ...input, expectedVersion: document.latestVersion.version }
        : input,
    ),
  people: (
    query: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<AgreementPeoplePage> =>
    request(
      `/people?query=${id(query)}${cursor ? `&cursor=${id(cursor)}` : ""}`,
      signal,
    ),
  assign: (
    versionId: string,
    recipientUserIds: string[],
    signal: AbortSignal,
  ): Promise<AgreementAssignmentPage> =>
    request(`/versions/${id(versionId)}/assign`, signal, {
      recipientUserIds,
      adultsConfirmed: true,
    }),
  assignments: (
    documentId: string,
    signal: AbortSignal,
    cursor?: string,
  ): Promise<AgreementAssignmentPage> =>
    request(
      `/assignments?documentId=${id(documentId)}${cursor ? `&cursor=${id(cursor)}` : ""}`,
      signal,
    ),
  acknowledge: (
    assignment: AgreementAssignment,
    typedName: string,
    signal: AbortSignal,
  ): Promise<AgreementAssignment> =>
    request(`/assignments/${id(assignment.id)}/acknowledge`, signal, {
      versionId: assignment.version.id,
      typedName,
      confirmed: true,
    }),
  signedCopy: (
    assignment: AgreementAssignment,
    typedName: string,
    signedOn: string,
    pdf: AgreementPdfInput,
    signal: AbortSignal,
  ): Promise<AgreementAssignment> =>
    request(`/assignments/${id(assignment.id)}/signed-copy`, signal, {
      versionId: assignment.version.id,
      typedName,
      signedOn,
      pdf,
    }),
};
export async function readAgreementPdf(file: File): Promise<AgreementPdfInput> {
  if (
    !file.size ||
    file.size > 2 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new Error("Choose a PDF no larger than 2 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("This file does not have a PDF signature.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { fileName: file.name, base64: btoa(binary) };
}
export async function downloadAgreement(
  path: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`${base}${path}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw await apiErrorFromResponse(
      response,
      "The file could not be downloaded.",
    );
  const blob = await response.blob();
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "agreement.pdf";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
