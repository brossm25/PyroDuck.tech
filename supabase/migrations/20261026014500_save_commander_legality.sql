-- Applied manually in Supabase and browser-tested on 2026-10-25.
-- Change a deck card's printing and synchronize its linked chase entry.

BEGIN;

CREATE OR REPLACE FUNCTION public.change_deck_card_printing(
  p_entry_id uuid,
  p_expected_scryfall_id uuid,
  p_expected_finish text,
  p_printing jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_existing public.deck_cards%rowtype;
  v_new public.deck_cards%rowtype;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before changing a printing.';
  END IF;

  IF p_printing IS NULL OR jsonb_typeof(p_printing) <> 'object' THEN
    RAISE EXCEPTION 'Choose a valid printing.';
  END IF;

  SELECT dc.*
  INTO v_existing
  FROM public.deck_cards AS dc
  JOIN public.decks AS d ON d.id = dc.deck_id
  WHERE dc.id = p_entry_id
    AND d.user_id = v_user
  FOR UPDATE OF dc
  FOR SHARE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This card is not in one of your decks.';
  END IF;

  IF v_existing.scryfall_id IS DISTINCT FROM p_expected_scryfall_id
     OR v_existing.finish IS DISTINCT FROM p_expected_finish THEN
    RAISE EXCEPTION 'This printing changed. Reload the deck and try again.';
  END IF;

  SELECT *
  INTO v_new
  FROM jsonb_populate_record(NULL::public.deck_cards, p_printing);

  IF v_new.scryfall_id IS NULL
     OR v_new.name IS NULL OR btrim(v_new.name) = ''
     OR v_new.set_name IS NULL OR btrim(v_new.set_name) = ''
     OR v_new.collector_number IS NULL
     OR btrim(v_new.collector_number) = ''
     OR v_new.finish IS NULL
     OR v_new.finish NOT IN ('nonfoil', 'foil', 'etched') THEN
    RAISE EXCEPTION 'The selected printing is incomplete.';
  END IF;

  IF v_existing.oracle_id IS NOT NULL THEN
    IF v_new.oracle_id IS DISTINCT FROM v_existing.oracle_id THEN
      RAISE EXCEPTION 'Choose another printing of the same card.';
    END IF;
  ELSIF v_new.name IS DISTINCT FROM v_existing.name THEN
    RAISE EXCEPTION 'Choose another printing of the same card.';
  END IF;

  IF v_new.price_usd IS NOT NULL AND (
    v_new.price_usd::text IN ('NaN', 'Infinity', '-Infinity')
    OR v_new.price_usd < 0
    OR v_new.price_usd > 99999999.99
  ) THEN
    RAISE EXCEPTION 'The printing price is invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deck_cards AS dc
    WHERE dc.deck_id = v_existing.deck_id
      AND dc.id <> v_existing.id
      AND dc.scryfall_id = v_new.scryfall_id
      AND dc.finish = v_new.finish
      AND dc.card_role = v_existing.card_role
  ) THEN
    RAISE EXCEPTION
      'That printing and finish already exists in this section. No cards were changed.';
  END IF;

  UPDATE public.deck_cards
  SET
    scryfall_id = v_new.scryfall_id,
    oracle_id = v_new.oracle_id,
    name = v_new.name,
    set_name = v_new.set_name,
    collector_number = v_new.collector_number,
    finish = v_new.finish,
    image_url = v_new.image_url,
    scryfall_uri = v_new.scryfall_uri,
    type_line = v_new.type_line,
    mana_cost = v_new.mana_cost,
    mana_value = v_new.mana_value,
    colors = v_new.colors,
    color_identity = v_new.color_identity,
    oracle_text = v_new.oracle_text,
    card_faces = v_new.card_faces,
    commander_legality = v_new.commander_legality,
    legality_checked_at = CASE
    	WHEN v_new.commander_legality IS NOT NULL THEN now()
    	ELSE NULL
    END,
    price_usd = v_new.price_usd,
    price_checked_at = now(),
    manual_price_usd = CASE
      WHEN v_existing.scryfall_id = v_new.scryfall_id
        AND v_existing.finish = v_new.finish
      THEN v_existing.manual_price_usd
      ELSE NULL
    END,
    manual_price_updated_at = CASE
      WHEN v_existing.scryfall_id = v_new.scryfall_id
        AND v_existing.finish = v_new.finish
      THEN v_existing.manual_price_updated_at
      ELSE NULL
    END
  WHERE id = v_existing.id;

  UPDATE public.chase_cards
  SET
    scryfall_id = v_new.scryfall_id::text,
    oracle_id = v_new.oracle_id,
    name = v_new.name,
    set_name = v_new.set_name,
    collector_number = v_new.collector_number,
    finish = v_new.finish,
    image_url = v_new.image_url,
    scryfall_uri = v_new.scryfall_uri,
    price_usd = v_new.price_usd,
    price_checked_at = now(),
    current_price_usd = NULL,
    current_price_checked_at = NULL
  WHERE source_deck_card_id = v_existing.id
    AND user_id = v_user;

  RETURN v_existing.id;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.change_deck_card_printing(uuid, uuid, text, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.change_deck_card_printing(uuid, uuid, text, jsonb)
TO authenticated;

COMMIT;
