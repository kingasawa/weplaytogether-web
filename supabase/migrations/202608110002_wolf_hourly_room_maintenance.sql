-- Close inactive Ma Soi rooms and run hourly cleanup.
alter table public.wolf_room_players
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists wolf_room_players_set_updated_at on public.wolf_room_players;
create trigger wolf_room_players_set_updated_at
  before update on public.wolf_room_players
  for each row
  execute function public.set_updated_at();

create index if not exists wolf_room_players_room_updated_at_idx
  on public.wolf_room_players (room_id, updated_at desc);

create or replace function public.close_inactive_wolf_rooms(
  waiting_inactive_older_than interval default interval '2 hours',
  playing_inactive_older_than interval default interval '30 minutes'
)
returns table (
  closed_waiting_rooms integer,
  closed_playing_rooms integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if waiting_inactive_older_than < interval '1 hour'
    or playing_inactive_older_than < interval '30 minutes'
  then
    raise exception 'Inactive room thresholds are too small.';
  end if;

  with room_activity as (
    select
      room.id,
      greatest(
        room.updated_at,
        coalesce(max(player.joined_at), '-infinity'::timestamptz),
        coalesce(max(player.updated_at), '-infinity'::timestamptz)
      ) as last_activity_at
    from public.wolf_rooms room
    left join public.wolf_room_players player
      on player.room_id = room.id
    where room.status = 'waiting'
    group by room.id, room.updated_at
  ),
  closed_rooms as (
    update public.wolf_rooms room
    set
      status = 'finished',
      host_player_id = null,
      current_game_id = null
    from room_activity activity
    where room.id = activity.id
      and activity.last_activity_at < now() - waiting_inactive_older_than
    returning room.id
  )
  select count(*)::integer
  into closed_waiting_rooms
  from closed_rooms;

  with room_activity as (
    select
      room.id,
      greatest(
        room.updated_at,
        coalesce(game.updated_at, '-infinity'::timestamptz),
        coalesce(classic_state.updated_at, '-infinity'::timestamptz),
        coalesce(max(action.updated_at), '-infinity'::timestamptz),
        coalesce(max(vote.updated_at), '-infinity'::timestamptz),
        coalesce(max(confirmation.created_at), '-infinity'::timestamptz)
      ) as last_activity_at
    from public.wolf_rooms room
    left join public.wolf_game_sessions game
      on game.id = room.current_game_id
    left join public.classic_wolf_game_states classic_state
      on classic_state.game_id = game.id
    left join public.wolf_game_actions action
      on action.game_id = game.id
    left join public.wolf_game_votes vote
      on vote.game_id = game.id
    left join public.wolf_game_phase_confirmations confirmation
      on confirmation.game_id = game.id
    where room.status = 'playing'
    group by room.id, room.updated_at, game.updated_at, classic_state.updated_at
  ),
  closed_rooms as (
    update public.wolf_rooms room
    set
      status = 'finished',
      host_player_id = null,
      current_game_id = null
    from room_activity activity
    where room.id = activity.id
      and activity.last_activity_at < now() - playing_inactive_older_than
    returning room.id
  )
  select count(*)::integer
  into closed_playing_rooms
  from closed_rooms;

  return next;
end;
$$;

comment on function public.close_inactive_wolf_rooms(interval, interval)
is 'Marks inactive waiting/playing Ma Soi rooms as finished. Last activity is derived from room, player, game, action, vote, confirmation, and classic state timestamps.';

revoke all on function public.close_inactive_wolf_rooms(interval, interval) from public;
grant execute on function public.close_inactive_wolf_rooms(interval, interval) to service_role;

create or replace function public.maintain_wolf_rooms(
  waiting_inactive_older_than interval default interval '2 hours',
  playing_inactive_older_than interval default interval '30 minutes',
  closed_older_than interval default interval '1 hour'
)
returns table (
  closed_waiting_rooms integer,
  closed_playing_rooms integer,
  deleted_finished_rooms integer,
  deleted_completed_playing_rooms integer,
  deleted_empty_waiting_rooms integer,
  deleted_stale_waiting_rooms integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  select close_result.closed_waiting_rooms, close_result.closed_playing_rooms
  into closed_waiting_rooms, closed_playing_rooms
  from public.close_inactive_wolf_rooms(
    waiting_inactive_older_than,
    playing_inactive_older_than
  ) close_result;

  select
    cleanup_result.deleted_finished_rooms,
    cleanup_result.deleted_completed_playing_rooms,
    cleanup_result.deleted_empty_waiting_rooms,
    cleanup_result.deleted_stale_waiting_rooms
  into
    deleted_finished_rooms,
    deleted_completed_playing_rooms,
    deleted_empty_waiting_rooms,
    deleted_stale_waiting_rooms
  from public.cleanup_old_wolf_rooms(
    closed_older_than,
    closed_older_than,
    closed_older_than,
    interval '1 day'
  ) cleanup_result;

  return next;
end;
$$;

comment on function public.maintain_wolf_rooms(interval, interval, interval)
is 'Hourly Ma Soi maintenance entrypoint: closes inactive rooms and deletes closed room data through cascade cleanup.';

revoke all on function public.maintain_wolf_rooms(interval, interval, interval) from public;
grant execute on function public.maintain_wolf_rooms(interval, interval, interval) to service_role;

create extension if not exists pg_cron;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'wolf-cleanup-old-rooms'
  ) then
    perform cron.unschedule('wolf-cleanup-old-rooms');
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'wolf-hourly-room-maintenance'
  ) then
    perform cron.unschedule('wolf-hourly-room-maintenance');
  end if;

  perform cron.schedule(
    'wolf-hourly-room-maintenance',
    '17 * * * *',
    'select public.maintain_wolf_rooms();'
  );
end $$;
