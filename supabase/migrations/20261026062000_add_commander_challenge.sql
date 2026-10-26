-- Save one main deck per color identity for each user's 32-deck challenge.

BEGIN;

CREATE TABLE public.commander_challenge_decks (
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  color_identity text NOT NULL,
  deck_id uuid NOT NULL
    REFERENCES public.decks(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, color_identity),
  CONSTRAINT commander_challenge_color_identity_check CHECK (
    color_identity = 'C'
    OR (
      char_length(color_identity) BETWEEN 1 AND 5
      AND color_identity ~ '^W?U?B?R?G?$'
    )
  )
);

CREATE INDEX commander_challenge_decks_deck_id_idx
  ON public.commander_challenge_decks (deck_id);

ALTER TABLE public.commander_challenge_decks
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.commander_challenge_decks
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON public.commander_challenge_decks
  TO authenticated;

GRANT INSERT (user_id, color_identity, deck_id),
      UPDATE (deck_id)
  ON public.commander_challenge_decks
  TO authenticated;

CREATE POLICY "Read own challenge selections"
  ON public.commander_challenge_decks
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Choose own challenge decks"
  ON public.commander_challenge_decks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.decks AS deck
      WHERE deck.id = deck_id
        AND deck.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Change own challenge decks"
  ON public.commander_challenge_decks
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.decks AS deck
      WHERE deck.id = deck_id
        AND deck.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Clear own challenge selections"
  ON public.commander_challenge_decks
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;
