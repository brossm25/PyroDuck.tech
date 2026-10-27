-- Track each participant's last-read message in each conversation.

BEGIN;

CREATE TABLE public.message_read_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_kind text NOT NULL
    CHECK (conversation_kind IN ('friend', 'sale')),
  conversation_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL,
  last_read_id uuid NOT NULL,
  PRIMARY KEY (user_id, conversation_kind, conversation_id)
);

ALTER TABLE public.message_read_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.message_read_state
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS sale_messages_conversation_order_idx
  ON public.sale_messages (conversation_id, created_at, id);

CREATE FUNCTION public.mark_conversation_read(
  p_kind text,
  p_conversation_id uuid,
  p_message_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_created_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in.';
  END IF;

  IF p_kind = 'friend' THEN
    SELECT m.created_at INTO v_created_at
    FROM public.friend_messages AS m
    JOIN public.friend_conversations AS c
      ON c.id = m.conversation_id
    WHERE c.id = p_conversation_id
      AND m.id = p_message_id
      AND (c.user_low = v_user OR c.user_high = v_user);

  ELSIF p_kind = 'sale' THEN
    SELECT m.created_at INTO v_created_at
    FROM public.sale_messages AS m
    JOIN public.sale_conversations AS c
      ON c.id = m.conversation_id
    WHERE c.id = p_conversation_id
      AND m.id = p_message_id
      AND (c.buyer_id = v_user OR c.seller_id = v_user);

  ELSE
    RAISE EXCEPTION 'Invalid conversation type.';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message or conversation unavailable.';
  END IF;

  INSERT INTO public.message_read_state AS state (
    user_id, conversation_kind, conversation_id, last_read_at, last_read_id
  )
  VALUES (
    v_user, p_kind, p_conversation_id, v_created_at, p_message_id
  )
  ON CONFLICT (user_id, conversation_kind, conversation_id)
  DO UPDATE SET
    last_read_at = EXCLUDED.last_read_at,
    last_read_id = EXCLUDED.last_read_id
  WHERE (state.last_read_at, state.last_read_id)
    < (EXCLUDED.last_read_at, EXCLUDED.last_read_id);
END;
$function$;

CREATE FUNCTION public.get_my_unread_conversations()
RETURNS TABLE (
  conversation_kind text,
  conversation_id uuid,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH incoming AS (
    SELECT
      'friend'::text AS kind,
      m.conversation_id,
      m.created_at,
      m.id
    FROM public.friend_messages AS m
    JOIN public.friend_conversations AS c
      ON c.id = m.conversation_id
    WHERE auth.uid() IS NOT NULL
      AND (c.user_low = auth.uid() OR c.user_high = auth.uid())
      AND m.sender_id <> auth.uid()

    UNION ALL

    SELECT
      'sale'::text AS kind,
      m.conversation_id,
      m.created_at,
      m.id
    FROM public.sale_messages AS m
    JOIN public.sale_conversations AS c
      ON c.id = m.conversation_id
    WHERE auth.uid() IS NOT NULL
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
      AND m.sender_id <> auth.uid()
  )
  SELECT incoming.kind, incoming.conversation_id, count(*)
  FROM incoming
  LEFT JOIN public.message_read_state AS state
    ON state.user_id = auth.uid()
    AND state.conversation_kind = incoming.kind
    AND state.conversation_id = incoming.conversation_id
  WHERE (
  state.user_id IS NULL
  OR (incoming.created_at, incoming.id)
    > (state.last_read_at, state.last_read_id)
)
AND NOT EXISTS (
  SELECT 1
  FROM public.get_my_hidden_conversations() AS hidden
  WHERE hidden.conversation_kind = incoming.kind
    AND hidden.conversation_id = incoming.conversation_id
)
GROUP BY incoming.kind, incoming.conversation_id;
$function$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_unread_conversations()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(text, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_unread_conversations()
  TO authenticated;

COMMIT;
