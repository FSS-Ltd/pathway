-- Prisma's production connection uses public, while F21's protected message and
-- notice tables and enums live in app. Expose updatable, invoker-rights views
-- to Prisma without moving the audited app tables or their RLS/triggers.
-- Enum domains let Prisma's public-schema casts insert into the app columns;
-- cross-schema equality operators support Prisma's enum filters.

CREATE DOMAIN public."MessageConversationKind" AS app."MessageConversationKind";
CREATE DOMAIN public."MessageParticipantKind" AS app."MessageParticipantKind";
CREATE DOMAIN public."MessageDeliveryStatus" AS app."MessageDeliveryStatus";
CREATE DOMAIN public."AceNoticeAudience" AS app."AceNoticeAudience";
CREATE DOMAIN public."AceNoticeAudienceMemberKind" AS app."AceNoticeAudienceMemberKind";

REVOKE USAGE ON TYPE
  public."MessageConversationKind",
  public."MessageParticipantKind",
  public."MessageDeliveryStatus",
  public."AceNoticeAudience",
  public."AceNoticeAudienceMemberKind"
FROM PUBLIC;

CREATE FUNCTION app."public_message_conversation_kind_equal"(
  app."MessageConversationKind", public."MessageConversationKind"
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$ SELECT $1::pg_catalog.text = $2::pg_catalog.text $$;
CREATE OPERATOR public.= (
  LEFTARG = app."MessageConversationKind",
  RIGHTARG = public."MessageConversationKind",
  PROCEDURE = app."public_message_conversation_kind_equal"
);

CREATE FUNCTION app."public_message_participant_kind_equal"(
  app."MessageParticipantKind", public."MessageParticipantKind"
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$ SELECT $1::pg_catalog.text = $2::pg_catalog.text $$;
CREATE OPERATOR public.= (
  LEFTARG = app."MessageParticipantKind",
  RIGHTARG = public."MessageParticipantKind",
  PROCEDURE = app."public_message_participant_kind_equal"
);

CREATE FUNCTION app."public_message_delivery_status_equal"(
  app."MessageDeliveryStatus", public."MessageDeliveryStatus"
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$ SELECT $1::pg_catalog.text = $2::pg_catalog.text $$;
CREATE OPERATOR public.= (
  LEFTARG = app."MessageDeliveryStatus",
  RIGHTARG = public."MessageDeliveryStatus",
  PROCEDURE = app."public_message_delivery_status_equal"
);

CREATE FUNCTION app."public_ace_notice_audience_equal"(
  app."AceNoticeAudience", public."AceNoticeAudience"
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$ SELECT $1::pg_catalog.text = $2::pg_catalog.text $$;
CREATE OPERATOR public.= (
  LEFTARG = app."AceNoticeAudience",
  RIGHTARG = public."AceNoticeAudience",
  PROCEDURE = app."public_ace_notice_audience_equal"
);

CREATE FUNCTION app."public_ace_notice_audience_member_kind_equal"(
  app."AceNoticeAudienceMemberKind", public."AceNoticeAudienceMemberKind"
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$ SELECT $1::pg_catalog.text = $2::pg_catalog.text $$;
CREATE OPERATOR public.= (
  LEFTARG = app."AceNoticeAudienceMemberKind",
  RIGHTARG = public."AceNoticeAudienceMemberKind",
  PROCEDURE = app."public_ace_notice_audience_member_kind_equal"
);

REVOKE ALL ON FUNCTION
  app."public_message_conversation_kind_equal"(app."MessageConversationKind", public."MessageConversationKind"),
  app."public_message_participant_kind_equal"(app."MessageParticipantKind", public."MessageParticipantKind"),
  app."public_message_delivery_status_equal"(app."MessageDeliveryStatus", public."MessageDeliveryStatus"),
  app."public_ace_notice_audience_equal"(app."AceNoticeAudience", public."AceNoticeAudience"),
  app."public_ace_notice_audience_member_kind_equal"(app."AceNoticeAudienceMemberKind", public."AceNoticeAudienceMemberKind")
FROM PUBLIC;

CREATE VIEW public."MessageConversation" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageConversation";
CREATE VIEW public."MessageParticipant" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageParticipant";
CREATE VIEW public."Message" WITH (security_invoker = true)
  AS SELECT * FROM app."Message";
CREATE VIEW public."MessageParticipantReadCursor" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageParticipantReadCursor";
CREATE VIEW public."MessageDelivery" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageDelivery";
CREATE VIEW public."MessageAttachment" WITH (security_invoker = true)
  AS SELECT * FROM app."MessageAttachment";
CREATE VIEW public."AceNotice" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNotice";
CREATE VIEW public."AceNoticeAudienceMember" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNoticeAudienceMember";
CREATE VIEW public."AceNoticeReceipt" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNoticeReceipt";
CREATE VIEW public."AceNoticeAttachment" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNoticeAttachment";

REVOKE ALL ON TABLE
  public."MessageConversation",
  public."MessageParticipant",
  public."Message",
  public."MessageParticipantReadCursor",
  public."MessageDelivery",
  public."MessageAttachment",
  public."AceNotice",
  public."AceNoticeAudienceMember",
  public."AceNoticeReceipt",
  public."AceNoticeAttachment"
FROM PUBLIC;

-- Supabase has API roles; disposable CI PostgreSQL does not always have them.
DO $$
DECLARE
  api_role text;
  enum_names text[] := ARRAY[
    'MessageConversationKind', 'MessageParticipantKind',
    'MessageDeliveryStatus', 'AceNoticeAudience',
    'AceNoticeAudienceMemberKind'
  ];
  function_names text[] := ARRAY[
    'public_message_conversation_kind_equal',
    'public_message_participant_kind_equal',
    'public_message_delivery_status_equal',
    'public_ace_notice_audience_equal',
    'public_ace_notice_audience_member_kind_equal'
  ];
  view_names text[] := ARRAY[
    'MessageConversation', 'MessageParticipant', 'Message',
    'MessageParticipantReadCursor', 'MessageDelivery', 'MessageAttachment',
    'AceNotice', 'AceNoticeAudienceMember', 'AceNoticeReceipt',
    'AceNoticeAttachment'
  ];
  i integer;
  name text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF to_regrole(api_role) IS NULL THEN
      CONTINUE;
    END IF;

    FOR i IN 1..array_length(enum_names, 1) LOOP
      EXECUTE format('REVOKE USAGE ON TYPE public.%I FROM %I', enum_names[i], api_role);
      EXECUTE format(
        'REVOKE ALL ON FUNCTION app.%I(app.%I, public.%I) FROM %I',
        function_names[i], enum_names[i], enum_names[i], api_role
      );
    END LOOP;

    FOREACH name IN ARRAY view_names LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', name, api_role);
    END LOOP;
  END LOOP;
END;
$$;
