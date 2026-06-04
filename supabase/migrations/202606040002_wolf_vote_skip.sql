alter table public.wolf_game_votes
  add column if not exists is_skip boolean not null default false;

alter table public.wolf_game_votes
  alter column target_player_id drop not null;

alter table public.wolf_game_votes
  drop constraint if exists wolf_game_votes_target_or_skip_check;

alter table public.wolf_game_votes
  add constraint wolf_game_votes_target_or_skip_check
  check (
    (is_skip = true and target_player_id is null)
    or
    (is_skip = false and target_player_id is not null)
  );
