-- Already applied manually in Supabase and tested on 2026-10-25.
-- Keep existing deck-linked chase entries synchronized.
-- Does not create chase entries or backfill existing data.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_deck_card_chase_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  SELECT d.user_id
  INTO v_owner
  FROM public.decks AS d
  WHERE d.id = NEW.deck_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot determine the deck owner.';
  END IF;

  IF NEW.is_proxy IS NOT TRUE
     OR NEW.card_role IS NULL
     OR NEW.card_role NOT IN ('main', 'commander') THEN

    DELETE FROM public.chase_cards
    WHERE source_deck_card_id = NEW.id
      AND user_id = v_owner;

  ELSE

    UPDATE public.chase_cards
    SET quantity = NEW.quantity
    WHERE source_deck_card_id = NEW.id
      AND user_id = v_owner
      AND quantity IS DISTINCT FROM NEW.quantity;

  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_deck_card_chase_entry()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_deck_card_chase_entry()
TO authenticated;

DROP TRIGGER IF EXISTS deck_cards_sync_chase_entry
ON public.deck_cards;

CREATE TRIGGER deck_cards_sync_chase_entry
AFTER UPDATE OF quantity, is_proxy, card_role
ON public.deck_cards
FOR EACH ROW
EXECUTE FUNCTION public.sync_deck_card_chase_entry();

COMMIT;
