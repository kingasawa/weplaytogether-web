-- Ma Sói một đêm: hệ thống tính điểm (points) và tiền tệ Xu (coins) cho user đã đăng nhập.
-- Chỉ user có tài khoản (public.users) mới được cộng điểm/Xu; guest (chỉ có session_id) không tính.

-- 1. Liên kết một hàng người chơi trong phòng với tài khoản đã đăng nhập (null cho guest).
alter table public.wolf_room_players
  add column if not exists user_id uuid null references public.users(id) on delete set null;

create index if not exists wolf_room_players_user_id_idx
  on public.wolf_room_players (user_id)
  where user_id is not null;

-- 2. Tổng điểm xếp hạng + tổng Xu, denormalized trên public.users để đọc bảng xếp hạng nhanh.
alter table public.users
  add column if not exists total_points integer not null default 0;

alter table public.users
  add column if not exists total_coins integer not null default 0;

-- 3. Sổ ghi nhận điểm/Xu từng ván (không cascade theo wolf_rooms vì phòng bị dọn dẹp định kỳ).
create table if not exists public.player_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  game_key text not null,
  game_id uuid not null,
  room_code text not null,
  team text not null,
  role text not null,
  is_winner boolean not null,
  points_awarded integer not null default 0,
  coins_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  constraint player_score_events_game_user_unique unique (game_id, user_id)
);

create index if not exists player_score_events_user_id_idx
  on public.player_score_events (user_id);

alter table public.player_score_events enable row level security;

drop policy if exists "player_score_events_select_own" on public.player_score_events;
create policy "player_score_events_select_own"
  on public.player_score_events
  for select
  using (auth.uid() = user_id);

-- Không có policy insert/update/delete cho client — chỉ service role (server action) được ghi.

-- 4. View công khai cho bảng xếp hạng (không lộ email). View chạy với quyền của người tạo
--    (thường là role có bypassrls trong Supabase SQL Editor) nên anon/authenticated đọc được
--    toàn bộ user dù RLS của public.users chỉ cho tự đọc hàng của mình.
create or replace view public.leaderboard as
select
  id,
  display_name,
  avatar_key,
  avatar_object_key,
  total_points,
  total_coins
from public.users
order by total_points desc, total_coins desc;

grant select on public.leaderboard to anon, authenticated;

-- 5. Function trao điểm/Xu, gọi từ server action bằng service role ngay sau khi ván Ma Sói
--    một đêm vào phase "result". Idempotent qua unique (game_id, user_id): gọi lại không cộng trùng.
create or replace function public.award_wolf_game_points(
  p_game_id uuid,
  p_room_code text,
  p_game_key text,
  p_awards jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with inserted as (
    insert into public.player_score_events (
      user_id, game_key, game_id, room_code, team, role, is_winner, points_awarded, coins_awarded
    )
    select
      (award->>'user_id')::uuid,
      p_game_key,
      p_game_id,
      p_room_code,
      award->>'team',
      award->>'role',
      (award->>'is_winner')::boolean,
      (award->>'points')::integer,
      (award->>'coins')::integer
    from jsonb_array_elements(p_awards) as award
    on conflict (game_id, user_id) do nothing
    returning user_id, points_awarded, coins_awarded
  )
  update public.users u
  set
    total_points = u.total_points + inserted.points_awarded,
    total_coins = u.total_coins + inserted.coins_awarded
  from inserted
  where u.id = inserted.user_id;
end;
$$;

revoke all on function public.award_wolf_game_points(uuid, text, text, jsonb) from public;
grant execute on function public.award_wolf_game_points(uuid, text, text, jsonb) to service_role;
