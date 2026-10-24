-- Undoes lock-old-camp-tables.sql: puts back Supabase's default grants on the
-- old camp tables and functions, and turns row-level security off on groups
-- again (the state camp_schema.sql left them in). Only needed to bring the old
-- feature back.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['camps', 'camp_admins', 'attendees', 'rooms', 'groups'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', t);
    END IF;
  END LOOP;
  IF to_regclass('public.groups') IS NOT NULL THEN
    ALTER TABLE public.groups DISABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regprocedure('public.add_attendee_encrypted(uuid,text,text,text,text,text,text,text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.add_attendee_encrypted(uuid, text, text, text, text, text, text, text)
      TO PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.get_attendees_decrypted(uuid,text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.get_attendees_decrypted(uuid, text) TO PUBLIC, anon, authenticated;
  END IF;
END $$;
