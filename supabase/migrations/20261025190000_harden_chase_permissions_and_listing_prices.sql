-- Applied manually in the Supabase SQL Editor on 2026-10-25.
-- Remove client TRUNCATE access and validate listing prices.

BEGIN;

REVOKE TRUNCATE ON TABLE public.chase_cards
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.sell_cards
  DROP CONSTRAINT IF EXISTS sell_cards_asking_price_usd_check;

ALTER TABLE public.sell_cards
  ADD CONSTRAINT sell_cards_asking_price_usd_check
  CHECK (
    asking_price_usd >= 0
    AND asking_price_usd <= 99999999.99
    AND asking_price_usd::text NOT IN ('NaN', 'Infinity', '-Infinity')
  );

COMMIT;
