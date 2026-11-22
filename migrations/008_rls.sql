-- Close the Supabase REST API (PostgREST) to the app's tables.
-- Supabase offers every table in the public schema to its API roles (anon, authenticated). The app
-- never uses that API: every query goes through the Next.js server, which connects as the owner of
-- these tables and is therefore not limited by row level security.
-- 1. Row level security on every table, with no policies: the API roles see no rows and change none.
-- 2. The API roles lose their rights on the tables and sequences, now and for tables made later.
-- A table added in a later migration must turn row level security on there too (test/rls.test.ts checks).

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Only on Supabase: local development and the tests (PGlite) have no such roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
  end if;
end $$;
