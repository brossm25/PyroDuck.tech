-- Separate concept deck ideas from regular deck collection totals.

BEGIN;

ALTER TABLE public.decks
  ADD COLUMN is_concept boolean NOT NULL DEFAULT false;

GRANT INSERT (is_concept), UPDATE (is_concept)
  ON public.decks
  TO authenticated;

COMMIT;
