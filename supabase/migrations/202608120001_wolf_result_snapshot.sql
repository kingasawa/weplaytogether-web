-- Persist Ma Sói Một Đêm result data independently from room membership.

alter table public.wolf_game_sessions
  add column if not exists result_snapshot jsonb null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wolf_game_sessions_result_snapshot_object_check'
  ) then
    alter table public.wolf_game_sessions
      add constraint wolf_game_sessions_result_snapshot_object_check
      check (result_snapshot is null or jsonb_typeof(result_snapshot) = 'object');
  end if;
end $$;

comment on column public.wolf_game_sessions.result_snapshot
is 'Frozen Ma Sói Một Đêm result payload used to keep result, roles, votes, and night log independent from wolf_room_players rows.';
