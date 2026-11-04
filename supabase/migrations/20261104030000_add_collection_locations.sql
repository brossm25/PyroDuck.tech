BEGIN;

CREATE TABLE public.collection_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_dump_box boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT collection_location_name_check CHECK (
    name = btrim(name)
    AND char_length(name) BETWEEN 1 AND 100
  ),

  CONSTRAINT collection_location_owner_key UNIQUE (user_id, id)
);

CREATE UNIQUE INDEX collection_location_name_idx
  ON public.collection_locations (user_id, lower(name));

CREATE UNIQUE INDEX collection_one_dump_box_idx
  ON public.collection_locations (user_id)
  WHERE is_dump_box;

ALTER TABLE public.collection_locations
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collection_locations
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON public.collection_locations
  TO authenticated;

GRANT INSERT (name, is_dump_box),
      UPDATE (name)
  ON public.collection_locations
  TO authenticated;

CREATE POLICY "Read own collection locations"
  ON public.collection_locations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Create own collection locations"
  ON public.collection_locations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Rename own collection locations"
  ON public.collection_locations
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Delete own collection locations"
  ON public.collection_locations
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;