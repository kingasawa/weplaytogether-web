-- Add public/private visibility for Ma Soi rooms.
alter table public.wolf_rooms
  add column if not exists is_public boolean not null default true;

comment on column public.wolf_rooms.is_public
  is 'Controls whether a waiting room is shown in public room lists. Private rooms can still be joined by code through server actions.';

create index if not exists wolf_rooms_public_waiting_idx
  on public.wolf_rooms (game_key, updated_at desc)
  where is_public = true and status = 'waiting';

drop policy if exists "Public read wolf rooms" on public.wolf_rooms;
create policy "Public read wolf rooms"
  on public.wolf_rooms
  for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "Public read wolf room players" on public.wolf_room_players;
create policy "Public read wolf room players"
  on public.wolf_room_players
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.wolf_rooms
      where public.wolf_rooms.id = public.wolf_room_players.room_id
        and public.wolf_rooms.is_public = true
    )
  );
