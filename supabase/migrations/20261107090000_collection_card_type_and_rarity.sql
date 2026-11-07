BEGIN;

ALTER TABLE public.collection_cards
  ADD COLUMN type_line text,
  ADD COLUMN rarity text,
  ADD CONSTRAINT collection_cards_type_line_check
    CHECK (
      type_line IS NULL
      OR (
        char_length(btrim(type_line)) BETWEEN 1 AND 500
      )
    ),
  ADD CONSTRAINT collection_cards_rarity_check
    CHECK (
      rarity IS NULL
      OR rarity IN (
        'common', 'uncommon', 'rare', 'mythic', 'special', 'bonus'
      )
    );

-- Existing ownership policies still apply to metadata refreshes.
GRANT UPDATE (type_line, rarity)
  ON public.collection_cards
  TO authenticated;

CREATE OR REPLACE FUNCTION public.add_collection_card_copies(
  p_request_id uuid,
  p_location_id uuid,
  p_card jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_card public.collection_cards%rowtype;
  v_payload jsonb;
  v_previous public.collection_card_add_requests%rowtype;
  v_entry_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before adding cards.';
  END IF;

  IF p_request_id IS NULL OR p_location_id IS NULL
     OR p_card IS NULL
     OR jsonb_typeof(p_card) <> 'object' THEN
    RAISE EXCEPTION 'Choose a location and valid card.';
  END IF;

  v_payload := jsonb_build_object(
    'location_id', p_location_id,
    'card', p_card
  );

  -- Serialize retries of the same request.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT *
  INTO v_previous
  FROM public.collection_card_add_requests
  WHERE user_id = v_user
    AND request_id = p_request_id;

  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'This save request was already used for different cards.';
    END IF;

    RETURN v_previous.entry_id;
  END IF;

  PERFORM 1
  FROM public.collection_locations
  WHERE id = p_location_id
    AND user_id = v_user
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose one of your own storage locations.';
  END IF;

  SELECT *
  INTO v_card
  FROM jsonb_populate_record(
    NULL::public.collection_cards,
    p_card
  );

  IF v_card.scryfall_id IS NULL
     OR v_card.quantity IS NULL
     OR v_card.quantity NOT BETWEEN 1 AND 1000000
     OR v_card.finish IS NULL
     OR v_card.finish NOT IN ('nonfoil', 'foil', 'etched') THEN
    RAISE EXCEPTION 'Choose a valid printing, finish, and quantity.';
  END IF;

  -- Existing table constraints also validate the card metadata.
  INSERT INTO public.collection_cards AS stored (
    user_id,
    location_id,
    scryfall_id,
    oracle_id,
    name,
    set_code,
    set_name,
    collector_number,
    finish,
    quantity,
    type_line,
    rarity
  )
  VALUES (
    v_user,
    p_location_id,
    v_card.scryfall_id,
    v_card.oracle_id,
    v_card.name,
    v_card.set_code,
    v_card.set_name,
    v_card.collector_number,
    v_card.finish,
    v_card.quantity,
    v_card.type_line,
    v_card.rarity
  )
  ON CONFLICT ON CONSTRAINT collection_card_printing_location_key
  DO UPDATE
    SET quantity = stored.quantity + EXCLUDED.quantity,
        type_line = COALESCE(EXCLUDED.type_line, stored.type_line),
        rarity = COALESCE(EXCLUDED.rarity, stored.rarity)
  RETURNING id INTO v_entry_id;

  INSERT INTO public.collection_card_add_requests (
    user_id,
    request_id,
    payload,
    entry_id
  )
  VALUES (
    v_user,
    p_request_id,
    v_payload,
    v_entry_id
  );

  RETURN v_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.add_collection_card_copies(uuid, uuid, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.add_collection_card_copies(uuid, uuid, jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.move_collection_card_copies(
  p_request_id uuid,
  p_entry_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_expected_quantity integer,
  p_quantity integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_source public.collection_cards%rowtype;
  v_previous public.collection_card_move_requests%rowtype;
  v_payload jsonb;
  v_destination_entry_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before moving cards.';
  END IF;

  IF p_request_id IS NULL
     OR p_entry_id IS NULL
     OR p_source_location_id IS NULL
     OR p_destination_location_id IS NULL
     OR p_expected_quantity IS NULL
     OR p_quantity IS NULL
     OR p_quantity NOT BETWEEN 1 AND 1000000
     OR p_expected_quantity NOT BETWEEN 1 AND 1000000
     OR p_quantity > p_expected_quantity THEN
    RAISE EXCEPTION 'Choose valid locations and a quantity to move.';
  END IF;

  IF p_source_location_id = p_destination_location_id THEN
    RAISE EXCEPTION 'Choose a different destination location.';
  END IF;

  v_payload := jsonb_build_object(
    'entry_id', p_entry_id,
    'source', p_source_location_id,
    'destination', p_destination_location_id,
    'expected_quantity', p_expected_quantity,
    'quantity', p_quantity
  );

  -- Serialize this user's moves, including retries and opposite moves.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'collection-move:' || v_user::text,
      0
    )
  );

  SELECT *
  INTO v_previous
  FROM public.collection_card_move_requests
  WHERE user_id = v_user
    AND request_id = p_request_id;

  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'This move request was already used for a different move.';
    END IF;

    RETURN v_previous.destination_entry_id;
  END IF;

  -- Lock both locations in a consistent order and verify ownership.
  PERFORM id
  FROM public.collection_locations
  WHERE user_id = v_user
    AND id IN (p_source_location_id, p_destination_location_id)
  ORDER BY id
  FOR SHARE;

  IF (
    SELECT count(*)
    FROM public.collection_locations
    WHERE user_id = v_user
      AND id IN (p_source_location_id, p_destination_location_id)
  ) <> 2 THEN
    RAISE EXCEPTION 'Choose two of your own storage locations.';
  END IF;

  SELECT *
  INTO v_source
  FROM public.collection_cards
  WHERE id = p_entry_id
    AND user_id = v_user
    AND location_id = p_source_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This card is no longer in the source location. Reopen it.';
  END IF;

  IF v_source.quantity IS DISTINCT FROM p_expected_quantity THEN
    RAISE EXCEPTION 'The stored quantity changed. Reopen the location before moving cards.';
  END IF;

  INSERT INTO public.collection_cards AS stored (
    user_id, location_id, scryfall_id, oracle_id,
    name, set_code, set_name, collector_number, finish, quantity,
    type_line, rarity
  )
  VALUES (
    v_user, p_destination_location_id,
    v_source.scryfall_id, v_source.oracle_id,
    v_source.name, v_source.set_code, v_source.set_name,
    v_source.collector_number, v_source.finish, p_quantity,
    v_source.type_line, v_source.rarity
  )
  ON CONFLICT ON CONSTRAINT collection_card_printing_location_key
  DO UPDATE
    SET quantity = stored.quantity + EXCLUDED.quantity,
        type_line = COALESCE(EXCLUDED.type_line, stored.type_line),
        rarity = COALESCE(EXCLUDED.rarity, stored.rarity)
  RETURNING id INTO v_destination_entry_id;

  IF p_quantity = v_source.quantity THEN
    DELETE FROM public.collection_cards
    WHERE id = v_source.id;
  ELSE
    UPDATE public.collection_cards
    SET quantity = quantity - p_quantity
    WHERE id = v_source.id;
  END IF;

  INSERT INTO public.collection_card_move_requests (
    user_id, request_id, payload, destination_entry_id
  )
  VALUES (
    v_user, p_request_id, v_payload, v_destination_entry_id
  );

  RETURN v_destination_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_collection_card_copies(
  uuid, uuid, uuid, uuid, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.move_collection_card_copies(
  uuid, uuid, uuid, uuid, integer, integer
) TO authenticated;

COMMIT;
