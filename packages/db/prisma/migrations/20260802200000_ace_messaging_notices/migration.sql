-- ACE tenant-owned parent/staff messaging and immutable notice recipients.
-- Message content is encrypted by the existing Prisma extension; attachment
-- records retain private storage keys only.

-- Prisma's permission-definition smoke applies migrations with `schema=public`.
-- Keep F21 objects in the app schema, while allowing legacy core references to
-- resolve from public in that portability check.
SET search_path TO app, public;

CREATE TYPE "MessageConversationKind" AS ENUM (
  'PARENT_STAFF',
  'STAFF_DIRECT',
  'STAFF_ROOM'
);
CREATE TYPE "MessageParticipantKind" AS ENUM ('GUARDIAN', 'STAFF');
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'READ');
CREATE TYPE "AceNoticeAudience" AS ENUM ('PARENTS', 'STAFF', 'PARENTS_AND_STAFF');
CREATE TYPE "AceNoticeAudienceMemberKind" AS ENUM ('GUARDIAN', 'STAFF');

CREATE TABLE "MessageConversation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" "MessageConversationKind" NOT NULL,
  "guardianIdentityId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "lastMessageSequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageConversation_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "MessageConversation_tenantId_kind_guardianIdentityId_key"
    UNIQUE ("tenantId", "kind", "guardianIdentityId"),
  CONSTRAINT "MessageConversation_parent_staff_shape_check" CHECK (
    ("kind" = 'PARENT_STAFF' AND "guardianIdentityId" IS NOT NULL)
    OR ("kind" IN ('STAFF_DIRECT', 'STAFF_ROOM') AND "guardianIdentityId" IS NULL)
  ),
  CONSTRAINT "MessageConversation_non_negative_sequence_check"
    CHECK ("lastMessageSequence" >= 0),
  CONSTRAINT "MessageConversation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageConversation_guardianIdentityId_tenantId_fkey"
    FOREIGN KEY ("guardianIdentityId", "tenantId")
    REFERENCES "GuardianIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageConversation_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MessageParticipant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "MessageParticipantKind" NOT NULL,
  "guardianIdentityId" TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),

  CONSTRAINT "MessageParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageParticipant_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "MessageParticipant_tenantId_conversationId_userId_key"
    UNIQUE ("tenantId", "conversationId", "userId"),
  CONSTRAINT "MessageParticipant_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipant_conversationId_tenantId_fkey"
    FOREIGN KEY ("conversationId", "tenantId")
    REFERENCES "MessageConversation"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipant_guardianIdentityId_tenantId_fkey"
    FOREIGN KEY ("guardianIdentityId", "tenantId")
    REFERENCES "GuardianIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderParticipantId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "clientRequestId" TEXT NOT NULL,
  "bodyEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "Message_tenantId_conversationId_sequence_key"
    UNIQUE ("tenantId", "conversationId", "sequence"),
  CONSTRAINT "Message_tenantId_conversationId_senderParticipantId_clientR_key"
    UNIQUE ("tenantId", "conversationId", "senderParticipantId", "clientRequestId"),
  CONSTRAINT "Message_body_not_blank_check" CHECK (btrim("bodyEncrypted") <> ''),
  CONSTRAINT "Message_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Message_conversationId_tenantId_fkey"
    FOREIGN KEY ("conversationId", "tenantId")
    REFERENCES "MessageConversation"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Message_senderParticipantId_tenantId_fkey"
    FOREIGN KEY ("senderParticipantId", "tenantId")
    REFERENCES "MessageParticipant"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MessageParticipantReadCursor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "lastReadSequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageParticipantReadCursor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageParticipantReadCursor_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "MessageParticipantReadCursor_tenantId_conversationId_partic_key"
    UNIQUE ("tenantId", "conversationId", "participantId"),
  CONSTRAINT "MessageParticipantReadCursor_non_negative_check"
    CHECK ("lastReadSequence" >= 0),
  CONSTRAINT "MessageParticipantReadCursor_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipantReadCursor_conversationId_tenantId_fkey"
    FOREIGN KEY ("conversationId", "tenantId")
    REFERENCES "MessageConversation"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageParticipantReadCursor_participantId_tenantId_fkey"
    FOREIGN KEY ("participantId", "tenantId")
    REFERENCES "MessageParticipant"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MessageDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "recipientParticipantId" TEXT NOT NULL,
  "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageDelivery_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "MessageDelivery_tenantId_messageId_recipientParticipantId_key"
    UNIQUE ("tenantId", "messageId", "recipientParticipantId"),
  CONSTRAINT "MessageDelivery_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageDelivery_messageId_tenantId_fkey"
    FOREIGN KEY ("messageId", "tenantId")
    REFERENCES "Message"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageDelivery_recipientParticipantId_tenantId_fkey"
    FOREIGN KEY ("recipientParticipantId", "tenantId")
    REFERENCES "MessageParticipant"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MessageAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageAttachment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "MessageAttachment_private_key_check" CHECK (btrim("storageKey") <> ''),
  CONSTRAINT "MessageAttachment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MessageAttachment_messageId_tenantId_fkey"
    FOREIGN KEY ("messageId", "tenantId")
    REFERENCES "Message"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceNotice" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" "AceNoticeAudience" NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceNotice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceNotice_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceNotice_title_not_blank_check" CHECK (btrim("title") <> ''),
  CONSTRAINT "AceNotice_body_not_blank_check" CHECK (btrim("body") <> ''),
  CONSTRAINT "AceNotice_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNotice_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceNoticeAudienceMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "noticeId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientKind" "AceNoticeAudienceMemberKind" NOT NULL,
  "guardianIdentityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceNoticeAudienceMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceNoticeAudienceMember_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceNoticeAudienceMember_tenantId_noticeId_recipientUserId_key"
    UNIQUE ("tenantId", "noticeId", "recipientUserId"),
  CONSTRAINT "AceNoticeAudienceMember_recipient_shape_check" CHECK (
    ("recipientKind" = 'GUARDIAN' AND "guardianIdentityId" IS NOT NULL)
    OR ("recipientKind" = 'STAFF' AND "guardianIdentityId" IS NULL)
  ),
  CONSTRAINT "AceNoticeAudienceMember_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNoticeAudienceMember_noticeId_tenantId_fkey"
    FOREIGN KEY ("noticeId", "tenantId")
    REFERENCES "AceNotice"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNoticeAudienceMember_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNoticeAudienceMember_guardianIdentityId_tenantId_fkey"
    FOREIGN KEY ("guardianIdentityId", "tenantId")
    REFERENCES "GuardianIdentity"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceNoticeReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "audienceMemberId" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceNoticeReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceNoticeReceipt_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceNoticeReceipt_audienceMemberId_tenantId_key"
    UNIQUE ("audienceMemberId", "tenantId"),
  CONSTRAINT "AceNoticeReceipt_read_requires_delivery_check"
    CHECK ("readAt" IS NULL OR "deliveredAt" IS NOT NULL),
  CONSTRAINT "AceNoticeReceipt_read_after_delivery_check"
    CHECK ("readAt" IS NULL OR "readAt" >= "deliveredAt"),
  CONSTRAINT "AceNoticeReceipt_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNoticeReceipt_audienceMemberId_tenantId_fkey"
    FOREIGN KEY ("audienceMemberId", "tenantId")
    REFERENCES "AceNoticeAudienceMember"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceNoticeAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "noticeId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AceNoticeAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceNoticeAttachment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceNoticeAttachment_private_key_check" CHECK (btrim("storageKey") <> ''),
  CONSTRAINT "AceNoticeAttachment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceNoticeAttachment_noticeId_tenantId_fkey"
    FOREIGN KEY ("noticeId", "tenantId")
    REFERENCES "AceNotice"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "MessageParticipant_tenantId_userId_removedAt_idx"
  ON "MessageParticipant"("tenantId", "userId", "removedAt");
CREATE INDEX "MessageParticipant_tenantId_conversationId_removedAt_idx"
  ON "MessageParticipant"("tenantId", "conversationId", "removedAt");
CREATE INDEX "Message_tenantId_conversationId_createdAt_idx"
  ON "Message"("tenantId", "conversationId", "createdAt");
CREATE INDEX "MessageParticipantReadCursor_tenantId_participantId_idx"
  ON "MessageParticipantReadCursor"("tenantId", "participantId");
CREATE INDEX "MessageDelivery_tenantId_recipientParticipantId_status_crea_idx"
  ON "MessageDelivery"("tenantId", "recipientParticipantId", "status", "createdAt");
CREATE INDEX "MessageAttachment_tenantId_messageId_idx"
  ON "MessageAttachment"("tenantId", "messageId");
CREATE INDEX "AceNotice_tenantId_publishedAt_idx"
  ON "AceNotice"("tenantId", "publishedAt");
CREATE INDEX "AceNoticeAudienceMember_tenantId_recipientUserId_createdAt_idx"
  ON "AceNoticeAudienceMember"("tenantId", "recipientUserId", "createdAt");
CREATE INDEX "AceNoticeReceipt_tenantId_deliveredAt_readAt_idx"
  ON "AceNoticeReceipt"("tenantId", "deliveredAt", "readAt");
CREATE INDEX "AceNoticeAttachment_tenantId_noticeId_idx"
  ON "AceNoticeAttachment"("tenantId", "noticeId");

CREATE FUNCTION app.assert_message_conversation_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  guardian_user_id text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app."StudentIdentity" student_identity
    WHERE student_identity."tenantId" = NEW."tenantId"
      AND student_identity."userId" = NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'Students cannot create messaging conversations'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."kind" = 'PARENT_STAFF' THEN
    SELECT guardian_identity."userId"
    INTO guardian_user_id
    FROM app."GuardianIdentity" guardian_identity
    WHERE guardian_identity."id" = NEW."guardianIdentityId"
      AND guardian_identity."tenantId" = NEW."tenantId";

    IF guardian_user_id = NEW."createdByUserId" OR EXISTS (
      SELECT 1
      FROM app."SiteMembership" site_membership
      WHERE site_membership."tenantId" = NEW."tenantId"
        AND site_membership."userId" = NEW."createdByUserId"
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Parent/staff conversations require their guardian or current tenant staff creator'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app."SiteMembership" site_membership
    WHERE site_membership."tenantId" = NEW."tenantId"
      AND site_membership."userId" = NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'Staff conversations require a current tenant staff creator'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_message_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_kind app."MessageConversationKind";
  conversation_guardian_identity_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."conversationId" IS DISTINCT FROM OLD."conversationId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."guardianIdentityId" IS DISTINCT FROM OLD."guardianIdentityId"
    OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt"
  ) THEN
    RAISE EXCEPTION 'Message participant identity is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT conversation."kind", conversation."guardianIdentityId"
  INTO conversation_kind, conversation_guardian_identity_id
  FROM app."MessageConversation" conversation
  WHERE conversation."id" = NEW."conversationId"
    AND conversation."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message conversation does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."kind" = 'GUARDIAN' THEN
    IF conversation_kind <> 'PARENT_STAFF'
      OR NEW."guardianIdentityId" IS NULL
      OR NEW."guardianIdentityId" IS DISTINCT FROM conversation_guardian_identity_id
    THEN
      RAISE EXCEPTION 'Guardian participants require their parent/staff conversation identity'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM app."GuardianIdentity" guardian_identity
      WHERE guardian_identity."id" = NEW."guardianIdentityId"
        AND guardian_identity."tenantId" = NEW."tenantId"
        AND guardian_identity."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'Guardian participant identity must match its user and tenant'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL AND NOT EXISTS (
      SELECT 1
      FROM app."GuardianChildRelationship" relationship
      WHERE relationship."tenantId" = NEW."tenantId"
        AND relationship."guardianIdentityId" = NEW."guardianIdentityId"
        AND relationship."legalAccess" <> 'NONE'
        AND relationship."startsAt" <= CURRENT_TIMESTAMP
        AND relationship."endedAt" IS NULL
        AND relationship."revokedAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'Guardian participants require a current guardian-child relationship'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL AND EXISTS (
      SELECT 1
      FROM app."StudentIdentity" student_identity
      WHERE student_identity."tenantId" = NEW."tenantId"
        AND student_identity."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'Students cannot participate in messaging'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW."guardianIdentityId" IS NOT NULL THEN
      RAISE EXCEPTION 'Staff participants cannot carry a guardian identity'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL AND NOT EXISTS (
      SELECT 1
      FROM app."SiteMembership" site_membership
      WHERE site_membership."tenantId" = NEW."tenantId"
        AND site_membership."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'Staff participants require a current site membership'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL AND EXISTS (
      SELECT 1
      FROM app."StudentIdentity" student_identity
      WHERE student_identity."tenantId" = NEW."tenantId"
        AND student_identity."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'Students cannot participate in messaging'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_active_message_participant(
  checked_tenant_id text,
  checked_participant_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  participant_user_id text;
  participant_removed_at timestamp(3);
BEGIN
  SELECT participant."userId", participant."removedAt"
  INTO participant_user_id, participant_removed_at
  FROM app."MessageParticipant" participant
  WHERE participant."id" = checked_participant_id
    AND participant."tenantId" = checked_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message participant does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF participant_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Message participant must be active'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app."StudentIdentity" student_identity
    WHERE student_identity."tenantId" = checked_tenant_id
      AND student_identity."userId" = participant_user_id
  ) THEN
    RAISE EXCEPTION 'Students cannot participate in messaging'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION app.assert_message_conversation_topology_values(
  checked_tenant_id text,
  checked_conversation_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_kind app."MessageConversationKind";
  conversation_guardian_identity_id text;
  active_guardian_count integer;
  matching_guardian_count integer;
  active_staff_count integer;
BEGIN
  SELECT conversation."kind", conversation."guardianIdentityId"
  INTO conversation_kind, conversation_guardian_identity_id
  FROM app."MessageConversation" conversation
  WHERE conversation."id" = checked_conversation_id
    AND conversation."tenantId" = checked_tenant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE participant."kind" = 'GUARDIAN'),
    count(*) FILTER (
      WHERE participant."kind" = 'GUARDIAN'
        AND participant."guardianIdentityId" = conversation_guardian_identity_id
    ),
    count(*) FILTER (WHERE participant."kind" = 'STAFF')
  INTO active_guardian_count, matching_guardian_count, active_staff_count
  FROM app."MessageParticipant" participant
  WHERE participant."tenantId" = checked_tenant_id
    AND participant."conversationId" = checked_conversation_id
    AND participant."removedAt" IS NULL;

  IF conversation_kind = 'PARENT_STAFF' THEN
    IF active_guardian_count <> 1
      OR matching_guardian_count <> 1
      OR active_staff_count < 1
    THEN
      RAISE EXCEPTION 'Parent/staff conversations require one guardian and at least one staff participant'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF conversation_kind = 'STAFF_DIRECT' THEN
    IF active_guardian_count <> 0 OR active_staff_count <> 2 THEN
      RAISE EXCEPTION 'Staff-direct conversations require exactly two staff participants'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF active_guardian_count <> 0 OR active_staff_count < 2 THEN
    RAISE EXCEPTION 'Staff rooms require at least two staff participants'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION app.assert_message_conversation_topology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'MessageConversation' THEN
    PERFORM app.assert_message_conversation_topology_values(
      NEW."tenantId",
      NEW."id"
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM app.assert_message_conversation_topology_values(
      OLD."tenantId",
      OLD."conversationId"
    );
  ELSE
    PERFORM app.assert_message_conversation_topology_values(
      NEW."tenantId",
      NEW."conversationId"
    );

    IF TG_OP = 'UPDATE' AND (
      OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
      OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    ) THEN
      PERFORM app.assert_message_conversation_topology_values(
        OLD."tenantId",
        OLD."conversationId"
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_message_conversation_sequence_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."lastMessageSequence" IS DISTINCT FROM OLD."lastMessageSequence"
    AND pg_trigger_depth() <> 2
  THEN
    RAISE EXCEPTION 'Message conversation sequence is allocated by message insertion only'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_message_conversation_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."guardianIdentityId" IS DISTINCT FROM OLD."guardianIdentityId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
  THEN
    RAISE EXCEPTION 'Message conversation identity is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.allocate_message_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_sequence integer := NEW."sequence";
  sender_conversation_id text;
BEGIN
  UPDATE app."MessageConversation"
  SET "lastMessageSequence" = "lastMessageSequence" + 1
  WHERE "id" = NEW."conversationId"
    AND "tenantId" = NEW."tenantId"
  RETURNING "lastMessageSequence" INTO NEW."sequence";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message conversation does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF requested_sequence <> 0 AND requested_sequence <> NEW."sequence" THEN
    RAISE EXCEPTION 'Message sequence must be allocated by the database'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.assert_active_message_participant(
    NEW."tenantId",
    NEW."senderParticipantId"
  );

  SELECT participant."conversationId"
  INTO sender_conversation_id
  FROM app."MessageParticipant" participant
  WHERE participant."id" = NEW."senderParticipantId"
    AND participant."tenantId" = NEW."tenantId";

  IF sender_conversation_id IS DISTINCT FROM NEW."conversationId" THEN
    RAISE EXCEPTION 'Message sender must be an active conversation participant'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_message_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Message rows are immutable after insertion'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.assert_message_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  message_conversation_id text;
  message_sender_participant_id text;
  recipient_conversation_id text;
  old_status_rank integer;
  new_status_rank integer;
BEGIN
  SELECT message."conversationId", message."senderParticipantId"
  INTO message_conversation_id, message_sender_participant_id
  FROM app."Message" message
  WHERE message."id" = NEW."messageId"
    AND message."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message delivery message does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM app.assert_active_message_participant(
    NEW."tenantId",
    NEW."recipientParticipantId"
  );

  SELECT participant."conversationId"
  INTO recipient_conversation_id
  FROM app."MessageParticipant" participant
  WHERE participant."id" = NEW."recipientParticipantId"
    AND participant."tenantId" = NEW."tenantId";

  IF recipient_conversation_id IS DISTINCT FROM message_conversation_id
    OR NEW."recipientParticipantId" = message_sender_participant_id
  THEN
    RAISE EXCEPTION 'Message delivery recipient must be a different active conversation participant'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."messageId" IS DISTINCT FROM OLD."messageId"
    OR NEW."recipientParticipantId" IS DISTINCT FROM OLD."recipientParticipantId"
  ) THEN
    RAISE EXCEPTION 'Message delivery scope is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" = 'PENDING' THEN
    new_status_rank := 0;
    IF NEW."deliveredAt" IS NOT NULL OR NEW."readAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Pending deliveries cannot have delivery or read timestamps'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."status" = 'DELIVERED' THEN
    new_status_rank := 1;
    IF NEW."deliveredAt" IS NULL OR NEW."readAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Delivered messages require only a delivery timestamp'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    new_status_rank := 2;
    IF NEW."deliveredAt" IS NULL
      OR NEW."readAt" IS NULL
      OR NEW."readAt" < NEW."deliveredAt"
    THEN
      RAISE EXCEPTION 'Read messages require ordered delivery and read timestamps'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_status_rank := CASE OLD."status"
      WHEN 'PENDING' THEN 0
      WHEN 'DELIVERED' THEN 1
      ELSE 2
    END;

    IF new_status_rank < old_status_rank
      OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" IS NULL)
      OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" < OLD."deliveredAt")
      OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS NULL)
      OR (OLD."readAt" IS NOT NULL AND NEW."readAt" < OLD."readAt")
    THEN
      RAISE EXCEPTION 'Message delivery state can only move forward'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_message_read_cursor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_last_sequence integer;
  participant_conversation_id text;
BEGIN
  SELECT conversation."lastMessageSequence"
  INTO conversation_last_sequence
  FROM app."MessageConversation" conversation
  WHERE conversation."id" = NEW."conversationId"
    AND conversation."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Read cursor conversation does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM app.assert_active_message_participant(
    NEW."tenantId",
    NEW."participantId"
  );

  SELECT participant."conversationId"
  INTO participant_conversation_id
  FROM app."MessageParticipant" participant
  WHERE participant."id" = NEW."participantId"
    AND participant."tenantId" = NEW."tenantId";

  IF participant_conversation_id IS DISTINCT FROM NEW."conversationId" THEN
    RAISE EXCEPTION 'Read cursor requires an active participant in its conversation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."conversationId" IS DISTINCT FROM OLD."conversationId"
    OR NEW."participantId" IS DISTINCT FROM OLD."participantId"
    OR NEW."lastReadSequence" < OLD."lastReadSequence"
  ) THEN
    RAISE EXCEPTION 'Read cursor scope is immutable and sequence cannot move backwards'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."lastReadSequence" > conversation_last_sequence THEN
    RAISE EXCEPTION 'Read cursor cannot exceed the conversation sequence'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_forward_state_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Forward-only messaging and notice state cannot be deleted'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE FUNCTION app.assert_ace_notice_audience_member_eligibility(
  checked_tenant_id text,
  checked_recipient_user_id text,
  checked_recipient_kind app."AceNoticeAudienceMemberKind",
  checked_guardian_identity_id text,
  selected_audience app."AceNoticeAudience"
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (selected_audience = 'PARENTS' AND checked_recipient_kind <> 'GUARDIAN')
    OR (selected_audience = 'STAFF' AND checked_recipient_kind <> 'STAFF')
  THEN
    RAISE EXCEPTION 'ACE notice recipient kind is outside the selected audience'
      USING ERRCODE = 'check_violation';
  END IF;

  IF checked_recipient_kind = 'GUARDIAN' THEN
    IF checked_guardian_identity_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM app."GuardianIdentity" guardian_identity
      WHERE guardian_identity."id" = checked_guardian_identity_id
        AND guardian_identity."tenantId" = checked_tenant_id
        AND guardian_identity."userId" = checked_recipient_user_id
    ) THEN
      RAISE EXCEPTION 'Guardian notice recipients require their tenant identity'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM app."GuardianChildRelationship" relationship
      WHERE relationship."tenantId" = checked_tenant_id
        AND relationship."guardianIdentityId" = checked_guardian_identity_id
        AND relationship."legalAccess" <> 'NONE'
        AND relationship."startsAt" <= CURRENT_TIMESTAMP
        AND relationship."endedAt" IS NULL
        AND relationship."revokedAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'Guardian notice recipients require a current guardian-child relationship'
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM app."StudentIdentity" student_identity
      WHERE student_identity."tenantId" = checked_tenant_id
        AND student_identity."userId" = checked_recipient_user_id
    ) THEN
      RAISE EXCEPTION 'Students cannot receive ACE notice audiences'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF checked_guardian_identity_id IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM app."SiteMembership" site_membership
      WHERE site_membership."tenantId" = checked_tenant_id
        AND site_membership."userId" = checked_recipient_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."StudentIdentity" student_identity
      WHERE student_identity."tenantId" = checked_tenant_id
        AND student_identity."userId" = checked_recipient_user_id
    )
  THEN
    RAISE EXCEPTION 'Staff notice recipients require a current site membership'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION app.assert_ace_notice_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  audience_member record;
  audience_member_count integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'ACE notice ownership is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."publishedAt" IS NOT NULL
    AND (
      NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
      OR NEW."audience" IS DISTINCT FROM OLD."audience"
    )
  THEN
    RAISE EXCEPTION 'Published notice publication metadata is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app."SiteMembership" site_membership
    WHERE site_membership."tenantId" = NEW."tenantId"
      AND site_membership."userId" = NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'ACE notice authors require a current site membership'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app."StudentIdentity" student_identity
    WHERE student_identity."tenantId" = NEW."tenantId"
      AND student_identity."userId" = NEW."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'Students cannot author ACE notices'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND NEW."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ACE notices must be published from a draft with an audience snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."publishedAt" IS NULL
    AND NEW."publishedAt" IS NOT NULL
  THEN
    SELECT count(*)
    INTO audience_member_count
    FROM app."AceNoticeAudienceMember" audience
    WHERE audience."tenantId" = NEW."tenantId"
      AND audience."noticeId" = NEW."id";

    IF audience_member_count = 0 THEN
      RAISE EXCEPTION 'ACE notices require at least one recipient before publication'
        USING ERRCODE = 'check_violation';
    END IF;

    FOR audience_member IN
      SELECT
        audience."recipientUserId",
        audience."recipientKind",
        audience."guardianIdentityId"
      FROM app."AceNoticeAudienceMember" audience
      WHERE audience."tenantId" = NEW."tenantId"
        AND audience."noticeId" = NEW."id"
    LOOP
      PERFORM app.assert_ace_notice_audience_member_eligibility(
        NEW."tenantId",
        audience_member."recipientUserId",
        audience_member."recipientKind",
        audience_member."guardianIdentityId",
        NEW."audience"
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_ace_notice_audience_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_audience app."AceNoticeAudience";
  notice_published_at timestamp(3);
BEGIN
  SELECT notice."audience", notice."publishedAt"
  INTO notice_audience, notice_published_at
  FROM app."AceNotice" notice
  WHERE notice."id" = NEW."noticeId"
    AND notice."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACE notice does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF notice_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published notice audience is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  PERFORM app.assert_ace_notice_audience_member_eligibility(
    NEW."tenantId",
    NEW."recipientUserId",
    NEW."recipientKind",
    NEW."guardianIdentityId",
    notice_audience
  );

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.reject_published_ace_notice_audience_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked_notice_published_at timestamp(3);
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW."noticeId" IS DISTINCT FROM OLD."noticeId"
  THEN
    RAISE EXCEPTION 'ACE notice audience members cannot move between notices'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT notice."publishedAt"
    INTO locked_notice_published_at
    FROM app."AceNotice" notice
    WHERE notice."id" = OLD."noticeId"
      AND notice."tenantId" = OLD."tenantId"
    FOR UPDATE;
  ELSE
    SELECT notice."publishedAt"
    INTO locked_notice_published_at
    FROM app."AceNotice" notice
    WHERE notice."id" = NEW."noticeId"
      AND notice."tenantId" = NEW."tenantId"
    FOR UPDATE;
  END IF;

  IF locked_notice_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published notice audience is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.assert_ace_notice_receipt_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_published_at timestamp(3);
BEGIN
  SELECT notice."publishedAt"
  INTO notice_published_at
  FROM app."AceNoticeAudienceMember" audience_member
  INNER JOIN app."AceNotice" notice
    ON notice."id" = audience_member."noticeId"
    AND notice."tenantId" = audience_member."tenantId"
  WHERE audience_member."id" = NEW."audienceMemberId"
    AND audience_member."tenantId" = NEW."tenantId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACE notice receipt audience member does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF notice_published_at IS NULL THEN
    RAISE EXCEPTION 'ACE notice receipts require a published notice'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."audienceMemberId" IS DISTINCT FROM OLD."audienceMemberId"
    OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" IS NULL)
    OR (OLD."deliveredAt" IS NOT NULL AND NEW."deliveredAt" < OLD."deliveredAt")
    OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS NULL)
    OR (OLD."readAt" IS NOT NULL AND NEW."readAt" < OLD."readAt")
    OR (NEW."readAt" IS NOT NULL AND NEW."deliveredAt" IS NULL)
    OR (NEW."readAt" IS NOT NULL AND NEW."readAt" < NEW."deliveredAt")
  ) THEN
    RAISE EXCEPTION 'ACE notice receipt state can only move forward'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_message_conversation_creator() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_participant() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_active_message_participant(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_conversation_topology_values(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_conversation_topology() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_conversation_sequence_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_conversation_identity_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.allocate_message_sequence() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_message_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_message_read_cursor() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_forward_state_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_audience_member_eligibility(text, text, app."AceNoticeAudienceMemberKind", text, app."AceNoticeAudience") FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_author() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_audience_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_published_ace_notice_audience_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.assert_ace_notice_receipt_progress() FROM PUBLIC;

CREATE TRIGGER "MessageConversation_validate_creator"
BEFORE INSERT ON "MessageConversation"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_conversation_creator();

CREATE TRIGGER "MessageParticipant_validate"
BEFORE INSERT OR UPDATE ON "MessageParticipant"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_participant();

CREATE CONSTRAINT TRIGGER "MessageConversation_validate_topology"
AFTER INSERT OR UPDATE ON "MessageConversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_message_conversation_topology();

CREATE CONSTRAINT TRIGGER "MessageParticipant_validate_topology"
AFTER INSERT OR UPDATE OR DELETE ON "MessageParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.assert_message_conversation_topology();

CREATE TRIGGER "MessageConversation_validate_sequence_update"
BEFORE UPDATE ON "MessageConversation"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_conversation_sequence_update();

CREATE TRIGGER "MessageConversation_validate_identity_update"
BEFORE UPDATE ON "MessageConversation"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_conversation_identity_update();

CREATE TRIGGER "Message_allocate_sequence"
BEFORE INSERT ON "Message"
FOR EACH ROW EXECUTE FUNCTION app.allocate_message_sequence();

CREATE TRIGGER "Message_reject_update"
BEFORE UPDATE ON "Message"
FOR EACH ROW EXECUTE FUNCTION app.reject_message_update();

CREATE TRIGGER "Message_reject_delete"
BEFORE DELETE ON "Message"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

CREATE TRIGGER "MessageParticipant_reject_delete"
BEFORE DELETE ON "MessageParticipant"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

CREATE TRIGGER "MessageDelivery_validate"
BEFORE INSERT OR UPDATE ON "MessageDelivery"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_delivery();

CREATE TRIGGER "MessageDelivery_reject_delete"
BEFORE DELETE ON "MessageDelivery"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

CREATE TRIGGER "MessageParticipantReadCursor_validate"
BEFORE INSERT OR UPDATE ON "MessageParticipantReadCursor"
FOR EACH ROW EXECUTE FUNCTION app.assert_message_read_cursor();

CREATE TRIGGER "MessageParticipantReadCursor_reject_delete"
BEFORE DELETE ON "MessageParticipantReadCursor"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

CREATE TRIGGER "AceNotice_validate_author"
BEFORE INSERT OR UPDATE ON "AceNotice"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_author();

CREATE TRIGGER "AceNoticeAudienceMember_freeze_published"
BEFORE INSERT OR UPDATE OR DELETE ON "AceNoticeAudienceMember"
FOR EACH ROW EXECUTE FUNCTION app.reject_published_ace_notice_audience_mutation();

CREATE TRIGGER "AceNoticeAudienceMember_validate"
BEFORE INSERT OR UPDATE ON "AceNoticeAudienceMember"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_audience_member();

CREATE TRIGGER "AceNoticeReceipt_validate_progress"
BEFORE INSERT OR UPDATE ON "AceNoticeReceipt"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_receipt_progress();

CREATE TRIGGER "AceNoticeReceipt_reject_delete"
BEFORE DELETE ON "AceNoticeReceipt"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

-- Every F21 table owns tenantId, forces tenant RLS, and has no NexSteps or
-- Data API exception.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'MessageConversation',
    'MessageParticipant',
    'Message',
    'MessageParticipantReadCursor',
    'MessageDelivery',
    'MessageAttachment',
    'AceNotice',
    'AceNoticeAudienceMember',
    'AceNoticeReceipt',
    'AceNoticeAttachment'
  ]
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
      tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);

    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;

RESET search_path;
