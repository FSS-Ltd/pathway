-- Realtime checks read access with a probe row whose private column retains
-- its false default, even when the client joins a private channel. The channel
-- privacy flag is enforced by Realtime; keep topic and membership checks here.
DO $$
BEGIN
  IF pg_catalog.to_regclass('realtime.messages') IS NOT NULL THEN
    IF (
      SELECT count(*)
      FROM pg_catalog.pg_policy
      WHERE polrelid = 'realtime.messages'::regclass
        AND polname IN ('ace_message_topics_receive', 'ace_message_topics_scope')
    ) <> 2 THEN
      RAISE EXCEPTION 'ACE Realtime read policies are missing';
    END IF;

    ALTER POLICY "ace_message_topics_receive" ON realtime.messages
      USING (
        extension = 'broadcast'
        AND realtime.topic() LIKE 'ace:conversation:%'
        AND app.authorize_ace_realtime_topic(realtime.topic())
      );

    ALTER POLICY "ace_message_topics_scope" ON realtime.messages
      USING (
        realtime.topic() NOT LIKE 'ace:conversation:%'
        OR (
          extension = 'broadcast'
          AND app.authorize_ace_realtime_topic(realtime.topic())
        )
      );
  END IF;
END;
$$;
