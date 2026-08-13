create table if not exists public.avalon_game_states (
  game_id uuid primary key references public.wolf_game_sessions(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists avalon_game_states_set_updated_at on public.avalon_game_states;
create trigger avalon_game_states_set_updated_at
  before update on public.avalon_game_states
  for each row
  execute function public.set_updated_at();

alter table public.avalon_game_states enable row level security;

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
        coalesce(avalon_state.updated_at, '-infinity'::timestamptz),
        coalesce(max(action.updated_at), '-infinity'::timestamptz),
        coalesce(max(vote.updated_at), '-infinity'::timestamptz),
        coalesce(max(confirmation.created_at), '-infinity'::timestamptz)
      ) as last_activity_at
    from public.wolf_rooms room
    left join public.wolf_game_sessions game
      on game.id = room.current_game_id
    left join public.classic_wolf_game_states classic_state
      on classic_state.game_id = game.id
    left join public.avalon_game_states avalon_state
      on avalon_state.game_id = game.id
    left join public.wolf_game_actions action
      on action.game_id = game.id
    left join public.wolf_game_votes vote
      on vote.game_id = game.id
    left join public.wolf_game_phase_confirmations confirmation
      on confirmation.game_id = game.id
    where room.status = 'playing'
    group by room.id, room.updated_at, game.updated_at, classic_state.updated_at, avalon_state.updated_at
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
is 'Marks inactive waiting/playing board game rooms as finished. Last activity is derived from room, player, game, action, vote, confirmation, classic state, and Avalon state timestamps.';

revoke all on function public.close_inactive_wolf_rooms(interval, interval) from public;
grant execute on function public.close_inactive_wolf_rooms(interval, interval) to service_role;
