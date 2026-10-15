export interface AgreementPdfInput {
  fileName: string;
  base64: string;
}
export interface AgreementVersionInput {
  title: string;
  contentText: string;
  originalPdf: AgreementPdfInput | null;
}
export interface AgreementVersion {
  id: string;
  documentId: string;
  version: number;
  title: string;
  contentText: string;
  hasOriginalFile: boolean;
  createdAt: string;
}
export interface AgreementDocument {
  id: string;
  latestVersion: AgreementVersion;
  createdAt: string;
}
export type AgreementAcceptanceMethod = "ACKNOWLEDGED" | "RECORDED_SIGNED_COPY";
export interface AgreementAcceptance {
  id: string;
  method: AgreementAcceptanceMethod;
  typedName: string;
  recordedAt: string;
  recordedByUserId: string;
  signedOn: string | null;
  hasSignedCopy: boolean;
}
export interface AgreementAssignment {
  id: string;
  version: AgreementVersion;
  recipientUserId: string;
  recipientName: string;
  assignedAt: string;
  adultConfirmedAt: string;
  supersededAt: string | null;
  acceptance: AgreementAcceptance | null;
}
export interface AgreementDocumentPage {
  items: AgreementDocument[];
  nextCursor: string | null;
}
export interface AgreementVersionPage {
  items: AgreementVersion[];
  nextCursor: string | null;
}
export interface AgreementAssignmentPage {
  items: AgreementAssignment[];
  nextCursor: string | null;
}
export interface AgreementPerson {
  id: string;
  name: string;
  ageStatus: "KNOWN_ADULT" | "NEEDS_CONFIRMATION";
}
export interface AgreementPeoplePage {
  items: AgreementPerson[];
  nextCursor: string | null;
}
