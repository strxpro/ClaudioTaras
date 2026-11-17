-- Claudio Taras portfolio — Supabase schema.
-- Run in Supabase → SQL Editor, then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
-- All reads/writes happen on the server with the service role, so RLS stays closed to the public.

create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key,
  data jsonb not null
);

create table if not exists public.kv (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.settings enable row level security;
alter table public.kv enable row level security;
-- No policies on purpose: anon/auth roles cannot read or write; the service role bypasses RLS.

-- Public bucket for uploaded media (videos, posters, screenshots).
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
