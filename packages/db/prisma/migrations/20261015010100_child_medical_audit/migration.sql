-- Keep medical access and updates distinguishable in the existing audit history.
ALTER TYPE "AuditEntityType" ADD VALUE 'CHILD_MEDICAL';
