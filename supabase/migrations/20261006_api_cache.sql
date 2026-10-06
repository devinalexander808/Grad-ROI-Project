-- Build 5: one table caches every upstream API answer (SPEC §7: "Cache every
-- external response with a timestamp"). Run once in the Supabase SQL editor.
--
-- Only the server touches it, with SUPABASE_SECRET_KEY, which bypasses row
-- level security. RLS is on with no policies, so the public anon key can
-- neither read nor write it.

create table if not exists public.api_cache (
  -- "bls:<series id>", "scorecard:<sha-256 of the query>" or
  -- "onet:<sha-256 of the request path>".
  key        text primary key,
  -- "BLS OEWS", "College Scorecard" or "O*NET Web Services", for reading the
  -- table by eye.
  source     text        not null,
  payload    jsonb       not null,
  -- When the upstream API was actually called.
  fetched_at timestamptz not null default now(),
  -- After this the row is stale: still served when the source is down, never
  -- when it is up.
  expires_at timestamptz not null
);

create index if not exists api_cache_expires_at on public.api_cache (expires_at);

alter table public.api_cache enable row level security;
