BEGIN;

CREATE TABLE public.precon_deck_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  deck_id uuid NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.precon_deck_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.precon_deck_requests
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_precon_deck(
  p_request_id uuid,
  p_name text,
  p_cards jsonb
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

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Missing save request ID.';
  END IF;

  -- Serialize retries of the same request.
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

  IF p_name IS NULL
     OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Deck name must be 1–100 characters.';
  END IF;

  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Invalid card list.';
  END IF;

  IF jsonb_array_length(p_cards) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Unsupported card list size.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.deck_cards, p_cards) AS card
    WHERE card.scryfall_id IS NULL
      OR card.quantity IS NULL
      OR card.quantity NOT BETWEEN 1 AND 1000
      OR card.card_role IS NULL
      OR card.card_role NOT IN ('main', 'commander')
      OR card.finish IS NULL
      OR card.finish NOT IN ('nonfoil', 'foil', 'etched')
  ) THEN
    RAISE EXCEPTION 'Invalid card, quantity, section, or finish.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_populate_recordset(NULL::public.deck_cards, p_cards) AS card
    WHERE card.card_role = 'commander'
  ) THEN
    RAISE EXCEPTION 'The precon needs a commander.';
  END IF;

  INSERT INTO public.decks (name, user_id, visibility, is_concept)
  VALUES (btrim(p_name), current_user_id, 'private', false)
  RETURNING id INTO saved_deck_id;

  INSERT INTO public.deck_cards (
    deck_id, scryfall_id, oracle_id, name, set_name,
    collector_number, finish, quantity, card_role,
    image_url, scryfall_uri, is_proxy,
    type_line, mana_cost, mana_value, colors, color_identity,
    oracle_text, card_faces, commander_legality,
    legality_checked_at, game_changer, power_checked_at,
    price_usd, price_checked_at
  )
  SELECT
    saved_deck_id, card.scryfall_id, card.oracle_id,
    card.name, card.set_name, card.collector_number,
    card.finish, card.quantity, card.card_role,
    card.image_url, card.scryfall_uri, false,
    card.type_line, card.mana_cost, card.mana_value,
    card.colors, card.color_identity, card.oracle_text,
    card.card_faces, card.commander_legality,
    card.legality_checked_at, card.game_changer,
    card.power_checked_at, card.price_usd, card.price_checked_at
  FROM jsonb_populate_recordset(NULL::public.deck_cards, p_cards) AS card;

  INSERT INTO public.precon_deck_requests (user_id, request_id, deck_id)
  VALUES (current_user_id, p_request_id, saved_deck_id);

  RETURN saved_deck_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_precon_deck(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_precon_deck(uuid, text, jsonb)
  TO authenticated;

COMMIT;