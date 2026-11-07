BEGIN;

CREATE TABLE public.collection_card_add_requests (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  entry_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.collection_card_add_requests
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collection_card_add_requests
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.add_collection_card_copies(
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
    quantity
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
    v_card.quantity
  )
  ON CONFLICT ON CONSTRAINT collection_card_printing_location_key
  DO UPDATE
    SET quantity = stored.quantity + EXCLUDED.quantity
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

COMMIT;