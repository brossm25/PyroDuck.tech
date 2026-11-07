BEGIN;

CREATE TABLE public.collection_batch_move_requests (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.collection_batch_move_requests
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collection_batch_move_requests
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.move_collection_cards_batch(
  p_request_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_cards jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_previous jsonb;
  v_row record;
  v_row_request uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before moving cards.';
  END IF;

  IF p_request_id IS NULL
     OR p_source_location_id IS NULL
     OR p_destination_location_id IS NULL
     OR p_source_location_id = p_destination_location_id THEN
    RAISE EXCEPTION 'Choose a different destination location.';
  END IF;

  IF p_cards IS NULL
     OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'Select cards to move.';
  END IF;

  IF jsonb_array_length(p_cards) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Select between 1 and 1,000 entries.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cards)
      AS selected(entry_id uuid, expected_quantity integer)
    WHERE entry_id IS NULL
       OR expected_quantity IS NULL
       OR expected_quantity NOT BETWEEN 1 AND 1000000
  ) THEN
    RAISE EXCEPTION 'The selected cards contain invalid quantities or IDs.';
  END IF;

  IF (
    SELECT count(DISTINCT entry_id)
    FROM jsonb_to_recordset(p_cards)
      AS selected(entry_id uuid, expected_quantity integer)
  ) <> jsonb_array_length(p_cards) THEN
    RAISE EXCEPTION 'Each entry can only be selected once.';
  END IF;

  v_payload := jsonb_build_object(
    'source', p_source_location_id,
    'destination', p_destination_location_id,
    'cards', p_cards
  );

  -- Use the same lock as individual moves.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'collection-move:' || v_user::text,
      0
    )
  );

  SELECT payload
  INTO v_previous
  FROM public.collection_batch_move_requests
  WHERE user_id = v_user
    AND request_id = p_request_id;

  IF FOUND THEN
    IF v_previous IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'This request was already used for a different move.';
    END IF;

    RETURN p_request_id;
  END IF;

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

  FOR v_row IN
    SELECT entry_id, expected_quantity
    FROM jsonb_to_recordset(p_cards)
      AS selected(entry_id uuid, expected_quantity integer)
    ORDER BY entry_id
  LOOP
    v_row_request := md5(
      'collection-batch-move:'
      || p_request_id::text
      || ':'
      || v_row.entry_id::text
    )::uuid;

    PERFORM public.move_collection_card_copies(
      v_row_request,
      v_row.entry_id,
      p_source_location_id,
      p_destination_location_id,
      v_row.expected_quantity,
      v_row.expected_quantity
    );
  END LOOP;

  INSERT INTO public.collection_batch_move_requests (
    user_id, request_id, payload
  )
  VALUES (
    v_user, p_request_id, v_payload
  );

  RETURN p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_collection_cards_batch(
  uuid, uuid, uuid, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.move_collection_cards_batch(
  uuid, uuid, uuid, jsonb
) TO authenticated;

COMMIT;