-- Shop: mua vật phẩm trang trí (khung avatar, khung thông tin người chơi) bằng Xu (total_coins).
-- File này TỰ ĐỦ (self-contained): dựng lại public.users + cột total_points/total_coins nếu các
-- migration trước đó (202608180002_user_profiles.sql, 202608250001_wolf_scoring_currency.sql)
-- chưa được áp dụng thủ công trên remote, để không phụ thuộc thứ tự apply. Các lệnh dùng
-- "if not exists" / "create or replace" nên chạy lại nhiều lần vẫn an toàn.

-- 0. Đảm bảo public.users + cột điểm/Xu tồn tại (idempotent, không ghi đè dữ liệu nếu đã có).
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

alter table public.users
  add column if not exists total_points integer not null default 0;

alter table public.users
  add column if not exists total_coins integer not null default 0;

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

-- 1. Danh sách email admin — hardcode theo yêu cầu (không dùng cột is_admin riêng trên users).
--    Đây là bản sao phía Postgres của ADMIN_EMAILS trong src/lib/admin.ts, để RLS chặn được
--    ghi trái phép ngay cả khi ai đó gọi thẳng Supabase API bỏ qua UI admin. Khi cần thêm/bớt
--    admin, sửa CẢ HAI nơi (mảng dưới đây và src/lib/admin.ts).
create or replace function public.is_shop_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (array['trancatkhanh@gmail.com'])
$$;

-- 2. Loại vật phẩm shop.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'shop_item_type') then
    create type public.shop_item_type as enum ('avatar_frame', 'profile_frame');
  end if;
end
$$;

-- 3. Vật phẩm shop. Client thường chỉ đọc được vật phẩm is_active = true; admin đọc/ghi mọi vật
--    phẩm qua is_shop_admin(). Ảnh dùng image_url (URL do admin nhập, ví dụ URL public trên R2).
create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.shop_item_type not null,
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 200),
  price_coins integer not null default 0 check (price_coins >= 0),
  image_url text not null check (char_length(image_url) between 1 and 2048),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_items_active_sort_idx
  on public.shop_items (item_type, is_active, sort_order);

create or replace function public.set_shop_items_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shop_items_updated_at on public.shop_items;
create trigger trg_shop_items_updated_at
  before update on public.shop_items
  for each row execute function public.set_shop_items_updated_at();

alter table public.shop_items enable row level security;

drop policy if exists "shop_items_select_active_or_admin" on public.shop_items;
create policy "shop_items_select_active_or_admin"
  on public.shop_items
  for select
  using (is_active = true or public.is_shop_admin());

drop policy if exists "shop_items_admin_write" on public.shop_items;
create policy "shop_items_admin_write"
  on public.shop_items
  for all
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

-- 4. Kho vật phẩm đã mua của user. KHÔNG có policy insert/update/delete cho client — chỉ ghi
--    qua function purchase_shop_item(...) (security definer) để chống gian lận Xu từ client.
create table if not exists public.user_shop_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.shop_items(id) on delete cascade,
  price_paid_coins integer not null default 0,
  purchased_at timestamptz not null default now(),
  constraint user_shop_items_unique unique (user_id, item_id)
);

create index if not exists user_shop_items_user_id_idx
  on public.user_shop_items (user_id);

alter table public.user_shop_items enable row level security;

drop policy if exists "user_shop_items_select_own_or_admin" on public.user_shop_items;
create policy "user_shop_items_select_own_or_admin"
  on public.user_shop_items
  for select
  using (auth.uid() = user_id or public.is_shop_admin());

-- 5. Trang bị vật phẩm: 2 cột trên users, client tự update qua policy users_update_own bên dưới.
--    Trigger đảm bảo chỉ trang bị được vật phẩm mình đã sở hữu và đúng loại (avatar/profile).
alter table public.users
  add column if not exists equipped_avatar_frame_id uuid null references public.shop_items(id) on delete set null;

alter table public.users
  add column if not exists equipped_profile_frame_id uuid null references public.shop_items(id) on delete set null;

create or replace function public.enforce_equipped_shop_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.shop_items%rowtype;
begin
  if new.equipped_avatar_frame_id is not null and
     new.equipped_avatar_frame_id is distinct from old.equipped_avatar_frame_id then
    select * into v_item from public.shop_items where id = new.equipped_avatar_frame_id;

    if v_item.id is null or v_item.item_type <> 'avatar_frame' then
      raise exception 'invalid_avatar_frame';
    end if;

    if not exists (
      select 1 from public.user_shop_items
      where user_id = new.id and item_id = new.equipped_avatar_frame_id
    ) then
      raise exception 'avatar_frame_not_owned';
    end if;
  end if;

  if new.equipped_profile_frame_id is not null and
     new.equipped_profile_frame_id is distinct from old.equipped_profile_frame_id then
    select * into v_item from public.shop_items where id = new.equipped_profile_frame_id;

    if v_item.id is null or v_item.item_type <> 'profile_frame' then
      raise exception 'invalid_profile_frame';
    end if;

    if not exists (
      select 1 from public.user_shop_items
      where user_id = new.id and item_id = new.equipped_profile_frame_id
    ) then
      raise exception 'profile_frame_not_owned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_equipped_shop_items on public.users;
create trigger trg_enforce_equipped_shop_items
  before update on public.users
  for each row execute function public.enforce_equipped_shop_items();

-- 6. Cho phép admin đọc/sửa mọi user (trang quản lý user); user thường vẫn chỉ thao tác hàng
--    của chính mình. Thay thế lại policy cũ từ 202608180002_user_profiles.sql cho chắc chắn.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  using (auth.uid() = id or public.is_shop_admin());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  using (auth.uid() = id or public.is_shop_admin())
  with check (auth.uid() = id or public.is_shop_admin());

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users
  for insert
  with check (auth.uid() = id);

-- 7. Mua vật phẩm: trừ Xu + ghi vào kho trong 1 transaction, chống gian lận/race từ client.
create or replace function public.purchase_shop_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.shop_items%rowtype;
  v_balance integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_item from public.shop_items where id = p_item_id for update;

  if v_item.id is null or v_item.is_active = false then
    raise exception 'item_not_available';
  end if;

  if exists (
    select 1 from public.user_shop_items where user_id = v_user_id and item_id = p_item_id
  ) then
    raise exception 'item_already_owned';
  end if;

  select total_coins into v_balance from public.users where id = v_user_id for update;

  if v_balance is null or v_balance < v_item.price_coins then
    raise exception 'insufficient_coins';
  end if;

  update public.users set total_coins = total_coins - v_item.price_coins where id = v_user_id;

  insert into public.user_shop_items (user_id, item_id, price_paid_coins)
  values (v_user_id, p_item_id, v_item.price_coins);

  return jsonb_build_object(
    'item_id', v_item.id,
    'price_paid_coins', v_item.price_coins,
    'remaining_coins', v_balance - v_item.price_coins
  );
end;
$$;

revoke all on function public.purchase_shop_item(uuid) from public;
grant execute on function public.purchase_shop_item(uuid) to authenticated;
