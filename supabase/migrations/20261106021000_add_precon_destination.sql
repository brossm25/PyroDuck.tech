BEGIN;

CREATE FUNCTION public.save_precon_deck_to_category(
  p_request_id uuid,
  p_name text,
  p_cards jsonb,
  p_is_concept boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  saved_deck_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before adding a precon.';
  END IF;

  IF p_request_id IS NULL OR p_is_concept IS NULL THEN
    RAISE EXCEPTION 'Missing request ID or deck destination.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_user_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT request.deck_id INTO saved_deck_id
  FROM public.precon_deck_requests AS request
  WHERE request.user_id = current_user_id
    AND request.request_id = p_request_id;

  IF FOUND THEN
    RETURN saved_deck_id;
  END IF;

  saved_deck_id := public.save_precon_deck(
    p_request_id, p_name, p_cards
  );

  UPDATE public.decks
  SET is_concept = p_is_concept
  WHERE id = saved_deck_id
    AND user_id = current_user_id;

  RETURN saved_deck_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.save_precon_deck_to_category(uuid, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.save_precon_deck_to_category(uuid, text, jsonb, boolean)
  TO authenticated;

COMMIT;