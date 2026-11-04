BEGIN;

CREATE TABLE public.collection_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  scryfall_id uuid NOT NULL,
  oracle_id uuid NOT NULL,
  name text NOT NULL,
  set_code text NOT NULL,
  set_name text NOT NULL,
  collector_number text NOT NULL,
  finish text NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT collection_card_location_owner_fkey
    FOREIGN KEY (user_id, location_id)
    REFERENCES public.collection_locations (user_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT collection_card_finish_check
    CHECK (finish IN ('nonfoil', 'foil', 'etched')),

  CONSTRAINT collection_card_quantity_check
    CHECK (quantity BETWEEN 1 AND 1000000),

  CONSTRAINT collection_card_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 300),

  CONSTRAINT collection_card_set_code_check
    CHECK (set_code ~ '^[a-z0-9]{1,20}$'),

  CONSTRAINT collection_card_set_name_check
    CHECK (char_length(btrim(set_name)) BETWEEN 1 AND 300),

  CONSTRAINT collection_card_number_check
    CHECK (char_length(btrim(collector_number)) BETWEEN 1 AND 100),

  CONSTRAINT collection_card_printing_location_key
    UNIQUE (user_id, location_id, scryfall_id, finish)
);

CREATE INDEX collection_cards_oracle_idx
  ON public.collection_cards (user_id, oracle_id);

ALTER TABLE public.collection_cards
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collection_cards
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON public.collection_cards
  TO authenticated;

GRANT INSERT (
  location_id,
  scryfall_id,
  oracle_id,
  name,
  set_code,
  set_name,
  collector_number,
  finish,
  quantity
),
UPDATE (location_id, quantity)
  ON public.collection_cards
  TO authenticated;

CREATE POLICY "Read own stored cards"
  ON public.collection_cards
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Add own stored cards"
  ON public.collection_cards
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Move or count own stored cards"
  ON public.collection_cards
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Remove own stored cards"
  ON public.collection_cards
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;