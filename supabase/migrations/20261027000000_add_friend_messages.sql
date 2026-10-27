-- Private direct messages between accepted friends.

BEGIN;

CREATE TABLE public.friend_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_conversations_order CHECK (user_low < user_high),
  CONSTRAINT friend_conversations_pair UNIQUE (user_low, user_high)
);

CREATE TABLE public.friend_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.friend_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 4000
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX friend_messages_conversation_order_idx
  ON public.friend_messages (conversation_id, created_at, id);

ALTER TABLE public.friend_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.friend_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.friend_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.friend_conversations TO authenticated;
GRANT SELECT ON public.friend_messages TO authenticated;
GRANT INSERT (conversation_id, sender_id, body)
  ON public.friend_messages TO authenticated;

CREATE POLICY "Participants read friend conversations"
  ON public.friend_conversations
  FOR SELECT TO authenticated
  USING (
    user_low = (SELECT auth.uid())
    OR user_high = (SELECT auth.uid())
  );

CREATE POLICY "Participants read friend messages"
  ON public.friend_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.friend_conversations AS conversation
      WHERE conversation.id = friend_messages.conversation_id
        AND (
          conversation.user_low = (SELECT auth.uid())
          OR conversation.user_high = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY "Accepted friends send messages"
  ON public.friend_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.friend_conversations AS conversation
      JOIN public.friendships AS friendship
        ON friendship.status = 'accepted'
        AND (
          (
            friendship.requester_id = conversation.user_low
            AND friendship.recipient_id = conversation.user_high
          )
          OR (
            friendship.requester_id = conversation.user_high
            AND friendship.recipient_id = conversation.user_low
          )
        )
      WHERE conversation.id = friend_messages.conversation_id
        AND (
          conversation.user_low = (SELECT auth.uid())
          OR conversation.user_high = (SELECT auth.uid())
        )
    )
  );

CREATE FUNCTION public.start_friend_conversation(p_friend_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conversation uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in to message a friend.';
  END IF;

  IF p_friend_id IS NULL OR p_friend_id = v_user THEN
    RAISE EXCEPTION 'Choose another player.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.friendships AS friendship
    WHERE friendship.status = 'accepted'
      AND (
        (friendship.requester_id = v_user
          AND friendship.recipient_id = p_friend_id)
        OR
        (friendship.requester_id = p_friend_id
          AND friendship.recipient_id = v_user)
      )
  ) THEN
    RAISE EXCEPTION 'You can only message accepted friends.';
  END IF;

  v_low := least(v_user, p_friend_id);
  v_high := greatest(v_user, p_friend_id);

  INSERT INTO public.friend_conversations (user_low, user_high)
  VALUES (v_low, v_high)
  ON CONFLICT (user_low, user_high) DO NOTHING
  RETURNING id INTO v_conversation;

  IF v_conversation IS NULL THEN
    SELECT conversation.id INTO v_conversation
    FROM public.friend_conversations AS conversation
    WHERE conversation.user_low = v_low
      AND conversation.user_high = v_high;
  END IF;

  RETURN v_conversation;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_friend_conversation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_friend_conversation(uuid)
  TO authenticated;

CREATE FUNCTION public.get_my_friend_conversations()
RETURNS TABLE (
  id uuid,
  other_username text,
  created_at timestamptz,
  can_send boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    conversation.id,
    profile.username,
    conversation.created_at,
    EXISTS (
      SELECT 1
      FROM public.friendships AS friendship
      WHERE friendship.status = 'accepted'
        AND (
          (
            friendship.requester_id = conversation.user_low
            AND friendship.recipient_id = conversation.user_high
          )
          OR (
            friendship.requester_id = conversation.user_high
            AND friendship.recipient_id = conversation.user_low
          )
        )
    )
  FROM public.friend_conversations AS conversation
  LEFT JOIN public.profiles AS profile
    ON profile.id = CASE
      WHEN conversation.user_low = auth.uid()
        THEN conversation.user_high
      ELSE conversation.user_low
    END
  WHERE auth.uid() IS NOT NULL
    AND (
      conversation.user_low = auth.uid()
      OR conversation.user_high = auth.uid()
    )
  ORDER BY conversation.created_at DESC, conversation.id;
$function$;

REVOKE ALL ON FUNCTION public.get_my_friend_conversations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_friend_conversations()
  TO authenticated;

COMMIT;
