-- Applied manually in Supabase and browser-tested on 2026-10-25.
-- Increase an existing deck entry's quantity without replacing its row.

BEGIN;

CREATE OR REPLACE FUNCTION public.add_deck_card_copies(
  p_deck_id uuid,
  p_scryfall_id uuid,
  p_finish text,
  p_card_role text,
  p_quantity integer,
  p_is_proxy boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_entry public.deck_cards%rowtype;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before adding cards.';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'Enter a quantity between 1 and 1000.';
  END IF;

  SELECT dc.*
  INTO v_entry
  FROM public.deck_cards AS dc
  JOIN public.decks AS d ON d.id = dc.deck_id
  WHERE dc.deck_id = p_deck_id
    AND dc.scryfall_id = p_scryfall_id
    AND dc.finish = p_finish
    AND dc.card_role = p_card_role
    AND d.user_id = v_user
  FOR UPDATE OF dc
  FOR SHARE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'The existing card was removed or changed. Reload the deck and try again.';
  END IF;

  IF p_is_proxy IS NULL OR v_entry.is_proxy IS DISTINCT FROM p_is_proxy THEN
    RAISE EXCEPTION
      'This printing already exists with a different Real/Proxy status. Match its status before adding copies.';
  END IF;

  IF v_entry.quantity + p_quantity > 1000 THEN
    RAISE EXCEPTION
      'Adding these copies would exceed the maximum quantity of 1000.';
  END IF;

  UPDATE public.deck_cards
  SET quantity = quantity + p_quantity
  WHERE id = v_entry.id;

  RETURN v_entry.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_deck_card_copies(
  uuid, uuid, text, text, integer, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.add_deck_card_copies(
  uuid, uuid, text, text, integer, boolean
) TO authenticated;

COMMIT;
