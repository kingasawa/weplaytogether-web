-- Đổi tên các bảng phòng chờ/gameplay dùng chung cho CẢ 3 game (wolf, wolf-classic, avalon).
-- Trước đây các bảng này mang tiền tố "wolf_" dù không còn riêng cho game Ma Sói Một Đêm nữa —
-- avalon và wolf-classic cũng dùng chung y hệt các bảng này. Đổi tên bỏ tiền tố "wolf_" cho
-- đúng bản chất "dùng chung toàn app". Không đổi tên classic_wolf_game_states/avalon_game_states
-- vì 2 bảng đó thực sự chỉ riêng cho từng game (state JSON theo luật riêng của mỗi game).
--
-- ALTER TABLE ... RENAME TO tự động cập nhật index, constraint, trigger, RLS policy, foreign
-- key, và supabase_realtime publication (tất cả tham chiếu theo OID, không theo tên) — không
-- cần chỉnh lại các đối tượng đó. Chỉ có 2 function bên dưới cần CREATE OR REPLACE lại vì thân
-- function (plpgsql) tham chiếu tên bảng bằng text, Postgres không tự viết lại được.

alter table public.wolf_rooms rename to rooms;
alter table public.wolf_room_players rename to room_players;
alter table public.wolf_game_sessions rename to game_sessions;
alter table public.wolf_game_cards rename to game_cards;
alter table public.wolf_game_actions rename to game_actions;
alter table public.wolf_game_votes rename to game_votes;
alter table public.wolf_game_phase_confirmations rename to game_phase_confirmations;

-- Định nghĩa lại cleanup_old_wolf_rooms(...) với tên bảng mới (logic giữ nguyên 100%,
-- xem bản gốc ở supabase/migrations/202606050001_wolf_cleanup_old_rooms.sql).
create or replace function public.cleanup_old_wolf_rooms(
  finished_older_than interval default interval '7 days',
  completed_playing_older_than interval default interval '7 days',
  empty_waiting_older_than interval default interval '1 day',
  stale_waiting_older_than interval default interval '14 days'
)
returns table (
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
  if finished_older_than < interval '1 hour'
    or completed_playing_older_than < interval '1 hour'
    or empty_waiting_older_than < interval '1 hour'
    or stale_waiting_older_than < interval '1 day'
  then
    raise exception 'Cleanup thresholds are too small.';
  end if;

  with target_rooms as (
    select id
    from public.rooms
    where status = 'finished'
      and updated_at < now() - finished_older_than
  ),
  clear_current_game as (
    update public.rooms room
    set current_game_id = null
    from target_rooms target
    where room.id = target.id
    returning room.id
  ),
  deleted_rooms as (
    delete from public.rooms room
    using target_rooms target
    where room.id = target.id
    returning room.id
  )
  select count(*)::integer
  into deleted_finished_rooms
  from deleted_rooms;

  with target_rooms as (
    select room.id
    from public.rooms room
    join public.game_sessions game
      on game.id = room.current_game_id
    where room.status = 'playing'
      and game.phase = 'result'
      and game.updated_at < now() - completed_playing_older_than
  ),
  clear_current_game as (
    update public.rooms room
    set current_game_id = null
    from target_rooms target
    where room.id = target.id
    returning room.id
  ),
  deleted_rooms as (
    delete from public.rooms room
    using target_rooms target
    where room.id = target.id
    returning room.id
  )
  select count(*)::integer
  into deleted_completed_playing_rooms
  from deleted_rooms;

  with target_rooms as (
    select room.id
    from public.rooms room
    where room.status = 'waiting'
      and room.current_game_id is null
      and room.updated_at < now() - empty_waiting_older_than
      and not exists (
        select 1
        from public.room_players player
        where player.room_id = room.id
      )
  ),
  deleted_rooms as (
    delete from public.rooms room
    using target_rooms target
    where room.id = target.id
    returning room.id
  )
  select count(*)::integer
  into deleted_empty_waiting_rooms
  from deleted_rooms;

  with target_rooms as (
    select room.id
    from public.rooms room
    where room.status = 'waiting'
      and room.current_game_id is null
      and room.updated_at < now() - stale_waiting_older_than
  ),
  deleted_rooms as (
    delete from public.rooms room
    using target_rooms target
    where room.id = target.id
    returning room.id
  )
  select count(*)::integer
  into deleted_stale_waiting_rooms
  from deleted_rooms;

  return next;
end;
$$;

comment on function public.cleanup_old_wolf_rooms(interval, interval, interval, interval)
is 'Deletes old board game rooms. Related players, sessions, cards, actions, votes, and phase confirmations are removed through ON DELETE CASCADE.';

-- Định nghĩa lại close_inactive_wolf_rooms(...) với tên bảng mới (logic giữ nguyên 100%,
-- bản gốc mới nhất ở supabase/migrations/202608130001_avalon_game_state.sql).
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
    from public.rooms room
    left join public.room_players player
      on player.room_id = room.id
    where room.status = 'waiting'
    group by room.id, room.updated_at
  ),
  closed_rooms as (
    update public.rooms room
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
    from public.rooms room
    left join public.game_sessions game
      on game.id = room.current_game_id
    left join public.classic_wolf_game_states classic_state
      on classic_state.game_id = game.id
    left join public.avalon_game_states avalon_state
      on avalon_state.game_id = game.id
    left join public.game_actions action
      on action.game_id = game.id
    left join public.game_votes vote
      on vote.game_id = game.id
    left join public.game_phase_confirmations confirmation
      on confirmation.game_id = game.id
    where room.status = 'playing'
    group by room.id, room.updated_at, game.updated_at, classic_state.updated_at, avalon_state.updated_at
  ),
  closed_rooms as (
    update public.rooms room
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
