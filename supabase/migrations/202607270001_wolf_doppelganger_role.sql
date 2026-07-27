do $$
begin
  if to_regtype('public.wolf_role') is null then
    raise exception 'public.wolf_role does not exist. Apply 202606030002_wolf_gameplay.sql before 202607270001_wolf_doppelganger_role.sql.';
  end if;

  execute 'alter type public.wolf_role add value if not exists ''doppelganger''';
end $$;

do $$
begin
  if to_regclass('public.wolf_game_actions') is null then
    raise exception 'public.wolf_game_actions does not exist. Apply 202606030002_wolf_gameplay.sql before 202607270001_wolf_doppelganger_role.sql.';
  end if;
end $$;

alter table public.wolf_game_actions
  add column if not exists target_player_id_3 uuid null references public.wolf_room_players(id) on delete set null;
