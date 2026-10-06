import { Prisma } from "@pathway/db";
import type { parsePaceInventoryCursor } from "./pace-inventory-cursor";

export interface StockRecord {
  enrollmentId: string;
  enrollmentCreatedAt: Date;
  childId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  subjectId: string;
  subjectName: string;
  currentPace: number;
  futurePaceNumbers: number[];
  hasPendingOrder: boolean;
}

export function stockQuery(
  tenantId: string,
  attentionOnly: boolean,
  cursor: ReturnType<typeof parsePaceInventoryCursor> | undefined,
  limit: number,
) {
  const cursorPredicate = cursor
    ? Prisma.sql`AND (
        inventory."enrollmentCreatedAt" < ${cursor.createdAt}
        OR (inventory."enrollmentCreatedAt" = ${cursor.createdAt}
          AND inventory."enrollmentId" < ${cursor.id})
      )`
    : Prisma.empty;

  return Prisma.sql`
    SELECT inventory.*
    FROM (
      SELECT
        enrollment.id AS "enrollmentId",
        enrollment."createdAt" AS "enrollmentCreatedAt",
        child.id AS "childId",
        child."firstName" AS "firstName",
        child."lastName" AS "lastName",
        child."preferredName" AS "preferredName",
        subject.id AS "subjectId",
        subject.name AS "subjectName",
        current_pace."paceNumber" AS "currentPace",
        ARRAY(
          SELECT supply."paceNumber"
          FROM "PaceInventorySupply" AS supply
          WHERE supply."tenantId" = enrollment."tenantId"
            AND supply."childId" = enrollment."childId"
            AND supply."subjectId" = enrollment."subjectId"
            AND supply."paceNumber" > current_pace."paceNumber"
          ORDER BY supply."paceNumber"
        ) AS "futurePaceNumbers",
        EXISTS (
          SELECT 1
          FROM "PaceInventoryOrder" AS pending_order
          WHERE pending_order."tenantId" = enrollment."tenantId"
            AND pending_order."childId" = enrollment."childId"
            AND pending_order."subjectId" = enrollment."subjectId"
            AND pending_order.status IN ('ORDERED', 'IN_TRANSIT')
            AND pending_order."paceNumber" > current_pace."paceNumber"
            AND NOT EXISTS (
              SELECT 1
              FROM "PaceInventorySupply" AS covered_supply
              WHERE covered_supply."tenantId" = pending_order."tenantId"
                AND covered_supply."childId" = pending_order."childId"
                AND covered_supply."subjectId" = pending_order."subjectId"
                AND covered_supply."paceNumber" = pending_order."paceNumber"
            )
        ) AS "hasPendingOrder"
      FROM "StudentSubjectEnrollment" AS enrollment
      INNER JOIN "Child" AS child
        ON child.id = enrollment."childId"
        AND child."tenantId" = enrollment."tenantId"
      INNER JOIN "Subject" AS subject
        ON subject.id = enrollment."subjectId"
        AND subject."tenantId" = enrollment."tenantId"
      LEFT JOIN "PaceProgress" AS progress
        ON progress."tenantId" = enrollment."tenantId"
        AND progress."childId" = enrollment."childId"
        AND progress."subjectId" = enrollment."subjectId"
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN COALESCE(progress."currentPace", enrollment."currentPace") BETWEEN 1 AND 144
            THEN COALESCE(progress."currentPace", enrollment."currentPace") + 1000
          ELSE COALESCE(progress."currentPace", enrollment."currentPace")
        END AS "paceNumber"
      ) AS current_pace
      WHERE enrollment."tenantId" = ${tenantId}
        AND enrollment.status = 'ACTIVE'
        AND subject."isActive" = true
        AND child."isGuest" = false
    ) AS inventory
    WHERE (${!attentionOnly}
      OR cardinality(inventory."futurePaceNumbers") = 0
      OR (cardinality(inventory."futurePaceNumbers") <= 2
        AND NOT inventory."hasPendingOrder"))
      ${cursorPredicate}
    ORDER BY inventory."enrollmentCreatedAt" DESC, inventory."enrollmentId" DESC
    LIMIT ${limit + 1}
  `;
}
