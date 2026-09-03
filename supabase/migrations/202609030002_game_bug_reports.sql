-- Game bug report system.
-- Idempotent where possible because this project commonly applies migrations manually in Supabase SQL Editor.

create or replace function public.is_shop_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (array['trancatkhanh@gmail.com'])
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type typ
    join pg_namespace nsp on nsp.oid = typ.typnamespace
    where nsp.nspname = 'public'
      and typ.typname = 'game_bug_report_status'
  ) then
    create type public.game_bug_report_status as enum (
      'open',
      'investigating',
      'fixed',
      'duplicate',
      'wont_fix'
    );
  end if;
end
$$;

create table if not exists public.game_bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid null,
  reporter_player_id uuid null,
  reporter_name text not null,
  game_key text not null,
  game_id uuid not null,
  room_id uuid not null,
  room_code text not null,
  game_phase text not null,
  report_text text not null,
  game_context jsonb not null default '{}'::jsonb,
  client_context jsonb not null default '{}'::jsonb,
  status public.game_bug_report_status not null default 'open',
  admin_note text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_bug_reports_text_length check (
    char_length(trim(report_text)) between 5 and 1000
  ),
  constraint game_bug_reports_game_key_check check (
    game_key in ('wolf', 'classic_wolf', 'avalon')
  )
);

do $$
begin
  if to_regclass('public.users') is not null and not exists (
    select 1
    from pg_constraint
    where conname = 'game_bug_reports_reporter_user_id_fkey'
      and conrelid = 'public.game_bug_reports'::regclass
  ) then
    alter table public.game_bug_reports
      add constraint game_bug_reports_reporter_user_id_fkey
      foreign key (reporter_user_id)
      references public.users(id)
      on delete set null;
  end if;
end
$$;

create index if not exists game_bug_reports_status_created_at_idx
  on public.game_bug_reports (status, created_at desc);

create index if not exists game_bug_reports_game_key_created_at_idx
  on public.game_bug_reports (game_key, created_at desc);

create index if not exists game_bug_reports_room_code_created_at_idx
  on public.game_bug_reports (room_code, created_at desc);

create index if not exists game_bug_reports_reporter_user_created_at_idx
  on public.game_bug_reports (reporter_user_id, created_at desc)
  where reporter_user_id is not null;

create index if not exists game_bug_reports_game_id_idx
  on public.game_bug_reports (game_id);

create or replace function public.set_game_bug_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.status in ('fixed', 'duplicate', 'wont_fix') and old.status is distinct from new.status then
    new.resolved_at = now();
  elsif new.status in ('open', 'investigating') and old.status is distinct from new.status then
    new.resolved_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_game_bug_reports_updated_at on public.game_bug_reports;
create trigger trg_game_bug_reports_updated_at
  before update on public.game_bug_reports
  for each row execute function public.set_game_bug_reports_updated_at();

alter table public.game_bug_reports enable row level security;

drop policy if exists "game_bug_reports_admin_select" on public.game_bug_reports;
create policy "game_bug_reports_admin_select"
  on public.game_bug_reports
  for select
  using (public.is_shop_admin());

drop policy if exists "game_bug_reports_admin_update" on public.game_bug_reports;
create policy "game_bug_reports_admin_update"
  on public.game_bug_reports
  for update
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

drop policy if exists "game_bug_reports_reporter_select_own" on public.game_bug_reports;
create policy "game_bug_reports_reporter_select_own"
  on public.game_bug_reports
  for select
  using (auth.uid() = reporter_user_id);
