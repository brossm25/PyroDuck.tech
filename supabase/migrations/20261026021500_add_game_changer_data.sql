-- Store saved Game Changer status for deck power indicators.

BEGIN;

ALTER TABLE public.deck_cards
  ADD COLUMN game_changer boolean,
  ADD COLUMN power_checked_at timestamptz;

GRANT INSERT (game_changer, power_checked_at),
      UPDATE (game_changer, power_checked_at)
ON public.deck_cards
TO authenticated;

COMMIT;
