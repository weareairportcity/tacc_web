-- Phase 6: stop public access to the retired camp feature's Supabase data.
-- Run once in the Supabase SQL editor (project nsiaryznabnexpwuokzv).
-- Undo with unlock-old-camp-tables.sql. Nothing is deleted: the rows stay,
-- readable only with the service-role key.
--
-- Why: the old rules let anyone with the site's public (anon) key read every
-- camp (including its admin_token), attendee and room; the groups table had
-- no row-level security at all; and add_attendee_encrypted, a SECURITY
-- DEFINER function, could be called by anyone to insert attendees.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['camps', 'camp_admins', 'attendees', 'rooms', 'groups'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;

  IF to_regprocedure('public.add_attendee_encrypted(uuid,text,text,text,text,text,text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.add_attendee_encrypted(uuid, text, text, text, text, text, text, text)
      FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.get_attendees_decrypted(uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_attendees_decrypted(uuid, text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Check: every row should show false.
SELECT c.relname AS table_name,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS signed_in_can_read
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('camps', 'camp_admins', 'attendees', 'rooms', 'groups');
