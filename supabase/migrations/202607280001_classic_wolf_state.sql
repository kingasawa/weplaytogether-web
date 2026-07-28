create table if not exists public.classic_wolf_game_states (
  game_id uuid primary key references public.wolf_game_sessions(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists classic_wolf_game_states_set_updated_at on public.classic_wolf_game_states;
create trigger classic_wolf_game_states_set_updated_at
  before update on public.classic_wolf_game_states
  for each row
  execute function public.set_updated_at();

alter table public.classic_wolf_game_states enable row level security;
