-- Allow each participant to hide conversations from their own inbox.

BEGIN;

CREATE TABLE public.hidden_conversations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_kind text NOT NULL
    CHECK (conversation_kind IN ('friend', 'sale')),
  conversation_id uuid NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_kind, conversation_id)
);

ALTER TABLE public.hidden_conversations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hidden_conversations
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.hide_my_conversation(
  p_kind text,
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in.';
  END IF;

  IF p_kind = 'friend' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.friend_conversations AS c
      WHERE c.id = p_conversation_id
        AND (c.user_low = v_user OR c.user_high = v_user)
    ) THEN
      RAISE EXCEPTION 'Conversation unavailable.';
    END IF;
  ELSIF p_kind = 'sale' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sale_conversations AS c
      WHERE c.id = p_conversation_id
        AND (c.buyer_id = v_user OR c.seller_id = v_user)
    ) THEN
      RAISE EXCEPTION 'Conversation unavailable.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid conversation type.';
  END IF;

  INSERT INTO public.hidden_conversations (
    user_id, conversation_kind, conversation_id, hidden_at
  )
  VALUES (v_user, p_kind, p_conversation_id, now())
  ON CONFLICT (user_id, conversation_kind, conversation_id)
  DO UPDATE SET hidden_at = EXCLUDED.hidden_at;
END;
$function$;

CREATE FUNCTION public.get_my_hidden_conversations()
RETURNS TABLE (conversation_kind text, conversation_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT hidden.conversation_kind, hidden.conversation_id
  FROM public.hidden_conversations AS hidden
  WHERE hidden.user_id = auth.uid()
    AND (
      (
        hidden.conversation_kind = 'friend'
        AND EXISTS (
          SELECT 1 FROM public.friend_conversations AS c
          WHERE c.id = hidden.conversation_id
            AND (c.user_low = auth.uid() OR c.user_high = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.friend_messages AS m
          WHERE m.conversation_id = hidden.conversation_id
            AND m.sender_id <> auth.uid()
            AND m.created_at > hidden.hidden_at
        )
      )
      OR (
        hidden.conversation_kind = 'sale'
        AND EXISTS (
          SELECT 1 FROM public.sale_conversations AS c
          WHERE c.id = hidden.conversation_id
            AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.sale_messages AS m
          WHERE m.conversation_id = hidden.conversation_id
            AND m.sender_id <> auth.uid()
            AND m.created_at > hidden.hidden_at
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.hide_my_conversation(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_hidden_conversations()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hide_my_conversation(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hidden_conversations()
  TO authenticated;

COMMIT;
