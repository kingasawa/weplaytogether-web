-- Game roles: cho phép admin đổi tên hiển thị (theo ngôn ngữ) và ảnh lá bài của từng role
-- trong 3 game (wolf, classic_wolf, avalon) qua trang /admin/game-roles, thay vì phải sửa
-- code + deploy lại. Idempotent — an toàn chạy lại nhiều lần (dự án này thường apply migration
-- thủ công qua Supabase SQL Editor).

create table if not exists public.game_roles (
  id uuid primary key default gen_random_uuid(),
  game_key text not null check (game_key in ('wolf', 'classic_wolf', 'avalon')),
  role_key text not null,
  display_name_vi text not null check (char_length(display_name_vi) between 1 and 60),
  display_name_en text not null check (char_length(display_name_en) between 1 and 60),
  image_url text not null check (char_length(image_url) between 1 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_key, role_key)
);

create index if not exists game_roles_game_key_idx on public.game_roles (game_key);

create or replace function public.set_game_roles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_game_roles_updated_at on public.game_roles;
create trigger trg_game_roles_updated_at
  before update on public.game_roles
  for each row execute function public.set_game_roles_updated_at();

-- RLS: ai cũng đọc được (cần cho cả guest chưa đăng nhập thấy đúng tên/ảnh role trong game);
-- chỉ admin (is_shop_admin(), định nghĩa ở 202608260001_shop_items.sql) được ghi.
alter table public.game_roles enable row level security;

drop policy if exists "game_roles_select_all" on public.game_roles;
create policy "game_roles_select_all"
  on public.game_roles
  for select
  using (true);

drop policy if exists "game_roles_admin_write" on public.game_roles;
create policy "game_roles_admin_write"
  on public.game_roles
  for all
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

-- Seed dữ liệu mặc định = tên hiển thị đang hardcode trong code hiện tại (src/lib/wolf-game.ts,
-- src/lib/classic-wolf-game.ts, src/lib/avalon-game.ts). Ảnh dùng URL GCS bucket
-- weplaytogether-uploads (đã upload sẵn qua scripts/upload-role-images.mjs, KHÔNG còn dùng ảnh
-- tĩnh trong public/images/boards/cards/ nữa — file gốc đã xoá khỏi source code). Admin sửa từ
-- đây, KHÔNG ghi đè nếu role đã tồn tại (on conflict do nothing) để không mất chỉnh sửa cũ khi
-- migration chạy lại.
insert into public.game_roles (game_key, role_key, display_name_vi, display_name_en, image_url)
values
  ('wolf', 'werewolf', 'Ma Sói', 'Werewolf', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/werewolf.webp'),
  ('wolf', 'werewolf_seer', 'Sói Tiên Tri', 'Werewolf Seer', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/werewolf_seer.webp'),
  ('wolf', 'villager', 'Dân Làng', 'Villager', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/villager.webp'),
  ('wolf', 'seer', 'Tiên Tri', 'Seer', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/seer.webp'),
  ('wolf', 'robber', 'Kẻ Trộm', 'Robber', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/robber.webp'),
  ('wolf', 'troublemaker', 'Kẻ Gây Rối', 'Troublemaker', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/troublemaker.webp'),
  ('wolf', 'witch', 'Phù Thuỷ', 'Witch', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/witch.webp'),
  ('wolf', 'drunk', 'Say Rượu', 'Drunk', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/drunk.webp'),
  ('wolf', 'insomniac', 'Mất Ngủ', 'Insomniac', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/insomniac.webp'),
  ('wolf', 'doppelganger', 'Nhân Bản', 'Doppelganger', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/doppelganger.webp'),
  ('wolf', 'copycat', 'Copy Cat', 'Copycat', 'https://storage.googleapis.com/weplaytogether-uploads/roles/wolf/copycat.webp'),

  ('classic_wolf', 'villager', 'Dân Làng', 'Villager', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/villager.webp'),
  ('classic_wolf', 'werewolf', 'Ma Sói', 'Werewolf', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/werewolf.webp'),
  ('classic_wolf', 'seer', 'Tiên Tri', 'Seer', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/seer.webp'),
  ('classic_wolf', 'witch', 'Phù Thuỷ', 'Witch', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/witch.webp'),
  ('classic_wolf', 'guard', 'Bảo Vệ', 'Guard', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/guard.webp'),
  ('classic_wolf', 'hunter', 'Thợ Săn', 'Hunter', 'https://storage.googleapis.com/weplaytogether-uploads/roles/classic_wolf/hunter.webp'),

  ('avalon', 'merlin', 'Merlin', 'Merlin', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/merlin.webp'),
  ('avalon', 'percival', 'Percival', 'Percival', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/percival.webp'),
  ('avalon', 'loyal_servant', 'Loyal Servant', 'Loyal Servant', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/loyal_servant.webp'),
  ('avalon', 'assassin', 'Assassin', 'Assassin', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/assassin.webp'),
  ('avalon', 'morgana', 'Morgana', 'Morgana', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/morgana.webp'),
  ('avalon', 'mordred', 'Mordred', 'Mordred', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/mordred.webp'),
  ('avalon', 'oberon', 'Oberon', 'Oberon', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/oberon.webp'),
  ('avalon', 'minion', 'Minion', 'Minion', 'https://storage.googleapis.com/weplaytogether-uploads/roles/avalon/minion.webp')
on conflict (game_key, role_key) do nothing;
