-- Bảng hồ sơ người chơi cho tài khoản đã đăng nhập (Google).
-- id = auth.users.id. Lưu tên hiển thị + avatar mặc định dùng trong game.
-- Truy cập trực tiếp từ client qua RLS (client đã có JWT), mỗi user chỉ thao tác hàng của mình.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_key text not null default 'avatar0',
  avatar_object_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- updated_at tự cập nhật khi sửa hồ sơ.
create or replace function public.set_users_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_users_updated_at();
