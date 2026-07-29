export enum AuditEntityType {
  CONCERN = "CONCERN",
  CHILD_NOTE = "CHILD_NOTE",
  ORG_ROLE = "ORG_ROLE",
}

export enum AuditAction {
  CREATED = "CREATED",
  UPDATED = "UPDATED",
  VIEWED = "VIEWED",
  ROLE_CREATED = "ROLE_CREATED",
  ROLE_UPDATED = "ROLE_UPDATED",
  ROLE_RETIRED = "ROLE_RETIRED",
  DELETED = "DELETED",
}

export interface RecordAuditEventInput {
  actorUserId: string;
  tenantId?: string;
  orgId: string;
  entityType: AuditEntityType;
  action: AuditAction;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}
