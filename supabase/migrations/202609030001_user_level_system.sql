-- Hệ thống level user: lưu XP tích lũy trọn đời, level được tính từ XP.
-- Depends on:
-- - 202608250001_wolf_scoring_currency.sql
-- - 202608260001_shop_items.sql

-- 1. Lưu XP level trên user. Không lưu riêng users.level để tránh lệch dữ liệu khi đổi bảng level.
alter table public.users
  add column if not exists level_xp integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_level_xp_nonnegative'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_level_xp_nonnegative check (level_xp >= 0);
  end if;
end;
$$;

comment on column public.users.level_xp is
  'XP tích lũy trọn đời dùng để tính level user. Chỉ tăng qua trusted RPC/admin, không giảm khi thua.';

-- 2. Ghi XP từng ván vào ledger để audit/backfill/idempotency.
alter table public.player_score_events
  add column if not exists xp_awarded integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_score_events_xp_awarded_nonnegative'
      and conrelid = 'public.player_score_events'::regclass
  ) then
    alter table public.player_score_events
      add constraint player_score_events_xp_awarded_nonnegative check (xp_awarded >= 0);
  end if;
end;
$$;

comment on column public.player_score_events.xp_awarded is
  'XP level nhận từ ván này. Phe thắng nhận XP, phe thua nhận 0 XP.';

-- 3. Backfill user cũ từ ledger điểm hiện có.
update public.player_score_events
set xp_awarded = greatest(points_awarded, 0)
where xp_awarded = 0
  and points_awarded > 0;

with event_xp as (
  select user_id, sum(xp_awarded)::integer as total_xp
  from public.player_score_events
  group by user_id
)
update public.users as u
set level_xp = greatest(u.level_xp, event_xp.total_xp)
from event_xp
where u.id = event_xp.user_id;

-- Fallback bảo thủ: nếu user có điểm nhưng không còn ledger, seed XP từ total_points dương.
update public.users as u
set level_xp = greatest(u.level_xp, greatest(u.total_points, 0))
where u.total_points > 0
  and not exists (
    select 1
    from public.player_score_events as event
    where event.user_id = u.id
  );

-- 4. Function tính level từ XP.
-- Formula: round(5000 * ((level - 1) / 99) ^ 1.5), level 100 đúng 5000 XP.
create or replace function public.get_user_level(p_level_xp integer)
returns integer
language sql
immutable
parallel safe
as $$
  select coalesce(max(level_value), 1)
  from (
    select
      level_value,
      case
        when level_value = 1 then 0
        when level_value = 100 then 5000
        else round(5000 * power((level_value - 1)::numeric / 99, 1.5))::integer
      end as min_xp
    from generate_series(1, 100) as level_value
  ) as levels
  where greatest(coalesce(p_level_xp, 0), 0) >= levels.min_xp;
$$;

create or replace function public.get_user_level_tier(p_level integer)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when greatest(coalesce(p_level, 1), 1) <= 9 then 'Tân Binh'
    when greatest(coalesce(p_level, 1), 1) <= 19 then 'Đồng'
    when greatest(coalesce(p_level, 1), 1) <= 34 then 'Bạc'
    when greatest(coalesce(p_level, 1), 1) <= 49 then 'Vàng'
    when greatest(coalesce(p_level, 1), 1) <= 64 then 'Bạch Kim'
    when greatest(coalesce(p_level, 1), 1) <= 79 then 'Kim Cương'
    when greatest(coalesce(p_level, 1), 1) <= 94 then 'Cao Thủ'
    else 'Huyền Thoại'
  end;
$$;

grant execute on function public.get_user_level(integer) to anon, authenticated;
grant execute on function public.get_user_level_tier(integer) to anon, authenticated;

-- 5. Bảo vệ cột điểm/Xu/XP khỏi client tự set/sửa qua policy users_insert_own/users_update_own.
-- Trusted RPC sẽ set app.user_stat_update = trusted trong transaction trước khi update.
create or replace function public.protect_user_progression_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.user_stat_update', true) = 'trusted'
    or auth.role() = 'service_role'
    or public.is_shop_admin()
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.total_points, 0) <> 0
      or coalesce(new.total_coins, 0) <> 0
      or coalesce(new.level_xp, 0) <> 0
    then
      raise exception 'protected_user_stats';
    end if;

    return new;
  end if;

  if new.total_points is distinct from old.total_points
    or new.total_coins is distinct from old.total_coins
    or new.level_xp is distinct from old.level_xp
  then
    raise exception 'protected_user_stats';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_user_progression_stats on public.users;
create trigger trg_protect_user_progression_stats
  before insert or update on public.users
  for each row execute function public.protect_user_progression_stats();

revoke all on function public.protect_user_progression_stats() from public;

-- 6. Patch purchase RPC để trigger biết đây là update Xu hợp lệ.
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

  perform set_config('app.user_stat_update', 'trusted', true);

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

-- 7. Patch award RPC để ghi XP và cộng level_xp idempotent cùng ledger điểm/Xu.
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
  perform set_config('app.user_stat_update', 'trusted', true);

  with parsed_awards as (
    select
      (award->>'user_id')::uuid as user_id,
      award->>'team' as team,
      award->>'role' as role,
      (award->>'is_winner')::boolean as is_winner,
      (award->>'points')::integer as points_awarded,
      (award->>'coins')::integer as coins_awarded,
      greatest(
        coalesce((award->>'xp')::integer, greatest((award->>'points')::integer, 0)),
        0
      ) as xp_awarded
    from jsonb_array_elements(p_awards) as award
  ),
  inserted as (
    insert into public.player_score_events (
      user_id,
      game_key,
      game_id,
      room_code,
      team,
      role,
      is_winner,
      points_awarded,
      coins_awarded,
      xp_awarded
    )
    select
      user_id,
      p_game_key,
      p_game_id,
      p_room_code,
      team,
      role,
      is_winner,
      points_awarded,
      coins_awarded,
      xp_awarded
    from parsed_awards
    on conflict (game_id, user_id) do nothing
    returning user_id, points_awarded, coins_awarded, xp_awarded
  )
  update public.users as u
  set
    total_points = u.total_points + inserted.points_awarded,
    total_coins = u.total_coins + inserted.coins_awarded,
    level_xp = u.level_xp + inserted.xp_awarded
  from inserted
  where u.id = inserted.user_id;
end;
$$;

revoke all on function public.award_wolf_game_points(uuid, text, text, jsonb) from public;
grant execute on function public.award_wolf_game_points(uuid, text, text, jsonb) to service_role;

-- 8. Leaderboard expose thêm XP/level để UI không phải query user riêng.
create or replace view public.leaderboard as
select
  id,
  display_name,
  avatar_key,
  avatar_object_key,
  total_points,
  total_coins,
  level_xp,
  public.get_user_level(level_xp) as level,
  public.get_user_level_tier(public.get_user_level(level_xp)) as level_tier
from public.users
order by total_points desc, total_coins desc, level_xp desc;

grant select on public.leaderboard to anon, authenticated;
