-- Some reversible art cards have no top-level Scryfall Oracle ID.
-- Their exact printing remains identified by the required scryfall_id.

BEGIN;

ALTER TABLE public.collection_cards
  ALTER COLUMN oracle_id DROP NOT NULL;

COMMIT;
