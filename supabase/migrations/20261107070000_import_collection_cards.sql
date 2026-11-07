BEGIN;

CREATE TABLE public.collection_import_requests (
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.collection_import_requests
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collection_import_requests
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.import_collection_cards(
  p_request_id uuid,
  p_location_id uuid,
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
    RAISE EXCEPTION 'Sign in before importing cards.';
  END IF;

  IF p_request_id IS NULL OR p_location_id IS NULL
     OR p_cards IS NULL THEN
    RAISE EXCEPTION 'Choose a location and reviewed cards.';
  END IF;

  IF jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'The reviewed cards must be a list.';
  END IF;

  IF jsonb_array_length(p_cards) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Import between 1 and 1,000 entries at a time.';
  END IF;

  v_payload := jsonb_build_object(
    'location_id', p_location_id,
    'cards', p_cards
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'collection-import:' || v_user::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT payload
  INTO v_previous
  FROM public.collection_import_requests
  WHERE user_id = v_user
    AND request_id = p_request_id;

  IF FOUND THEN
    IF v_previous IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'This import request was already used for a different list.';
    END IF;

    RETURN p_request_id;
  END IF;

  PERFORM 1
  FROM public.collection_locations
  WHERE id = p_location_id
    AND user_id = v_user
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose one of your own storage locations.';
  END IF;

  -- Consistent printing order reduces conflicting row locks.
  FOR v_row IN
    SELECT item, position
    FROM jsonb_array_elements(p_cards)
      WITH ORDINALITY AS entries(item, position)
    ORDER BY item->>'scryfall_id', item->>'finish', position
  LOOP
    -- A stable request ID for each row within this batch.
    v_row_request := pg_catalog.md5(
      'collection-import-row:' || p_request_id::text ||
      ':' || v_row.position::text
    )::uuid;

    PERFORM public.add_collection_card_copies(
      v_row_request,
      p_location_id,
      v_row.item
    );
  END LOOP;

  INSERT INTO public.collection_import_requests (
    user_id, request_id, payload
  )
  VALUES (
    v_user, p_request_id, v_payload
  );

  RETURN p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.import_collection_cards(uuid, uuid, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.import_collection_cards(uuid, uuid, jsonb)
TO authenticated;

COMMIT;