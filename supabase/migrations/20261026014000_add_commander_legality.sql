-- Add saved Commander legality data for informational deck warnings.

BEGIN;

ALTER TABLE public.deck_cards
  ADD COLUMN commander_legality text,
  ADD COLUMN legality_checked_at timestamptz,
  ADD CONSTRAINT deck_cards_commander_legality_check
    CHECK (
      commander_legality IN (
        'legal', 'not_legal', 'restricted', 'banned'
      )
    );

GRANT INSERT (commander_legality, legality_checked_at),
      UPDATE (commander_legality, legality_checked_at)
ON public.deck_cards
TO authenticated;

COMMIT;
