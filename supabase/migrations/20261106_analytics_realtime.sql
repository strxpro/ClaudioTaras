-- Run after supabase/schema.sql (Supabase → SQL Editor → paste → Run). Safe to run twice.

-- Anonymous page views (no IP, no cookie: `visitor` is a daily-rotating hash).
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text not null,
  locale text not null default '',
  country text,
  device text not null default 'desktop',
  referrer text,
  visitor text not null
);
create index if not exists page_views_at_idx on public.page_views (at desc);
create index if not exists page_views_visitor_idx on public.page_views (visitor, at);
alter table public.page_views enable row level security;
-- No policies: only the server (service role) reads and writes.

-- Faster inbox sorting.
create index if not exists messages_created_idx on public.messages (created_at desc);

-- Realtime feed for new messages and views (Supabase → Database → Replication shows them too).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'page_views') then
    alter publication supabase_realtime add table public.page_views;
  end if;
end $$;

-- Keep the table small: views older than 13 months are removed (needs the pg_cron extension;
-- enable it in Database → Extensions, or skip this block).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('page-views-cleanup', '15 3 * * *', $c$delete from public.page_views where at < now() - interval '13 months'$c$);
  end if;
end $$;
