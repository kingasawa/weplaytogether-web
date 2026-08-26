<!-- Last updated: 2026-08-26 -->

# Database Schema

## Verified Scope

This document tracks the Ma Sói multiplayer lobby and gameplay schema status.

Earlier verification on 2026-06-03 via Supabase REST returned `PGRST205` for `public.wolf_rooms`. The user later reported successful manual SQL execution for the lobby/gameplay migrations in Supabase SQL Editor.

On 2026-06-12, `public.wolf_role` was updated and verified through Supabase CLI `db query` over the session pooler. The verified enum values are `werewolf`, `villager`, `seer`, `robber`, `troublemaker`, `drunk`, `insomniac`, `werewolf_seer`, `witch`, and `copycat`.

On 2026-06-12, `public.wolf_game_actions.target_center_index_3` and its 0-2 check constraint were added and verified through Supabase CLI `db query`.

On 2026-07-27, local migration `202607270001_wolf_doppelganger_role.sql` was created to add the pending `doppelganger` enum value and `wolf_game_actions.target_player_id_3` for Nhân Bản copying Kẻ Gây Rối.

On 2026-07-28, local migration `202607280001_classic_wolf_state.sql` was created to add the separate `classic_wolf_game_states` table for Ma Sói nhiều đêm state stored as JSON. This keeps one-night Ma Sói gameplay tables and constraints unchanged.

On 2026-07-30, local migration `202607300001_wolf_avatar_key_new_assets.sql` was created to allow the named avatar asset keys `khanh`, `duong`, `duy`, `lan`, `na`, `oanh`, and `tri`.

On 2026-08-11, local migration `202608110001_wolf_room_visibility.sql` was created to add public/private room visibility. Public room lists should show only `waiting` rooms where `is_public = true`; private rooms remain joinable by code through server actions.

On 2026-08-11, local migration `202608110002_wolf_hourly_room_maintenance.sql` was created to close inactive rooms and run cleanup hourly. Waiting rooms inactive for 2 hours are marked `finished`; playing rooms inactive for 30 minutes are marked `finished`; already closed room data is deleted hourly after 1 hour.

On 2026-08-12, local migration `202608120001_wolf_result_snapshot.sql` was created to add `wolf_game_sessions.result_snapshot`. One-night Ma Sói result data should be frozen into this JSON payload when a game enters `result`, so role summaries, vote counts, winner text, and night movement logs no longer depend on rows remaining in `wolf_room_players`.

On 2026-08-17, local migration `202608170001_wolf_avatar_key_all_assets.sql` was created to repair the avatar key check constraint for deployments that already applied the older named-avatar migration without `duy`, `na`, and `oanh`.

On 2026-08-25, local migration `202608250001_wolf_scoring_currency.sql` was created to add a scoring (điểm) and currency (Xu) system for Ma Sói Một Đêm. Adds `wolf_room_players.user_id`, `users.total_points`/`users.total_coins`, the `player_score_events` ledger table, the public `leaderboard` view, and the `award_wolf_game_points(...)` function. Only logged-in users (rows with a non-null `wolf_room_players.user_id`) earn points/coins; guests are unaffected.

On 2026-08-26, local migration `202608260001_shop_items.sql` was created to add a shop feature: users spend `total_coins` (Xu) to buy decorative avatar frames and profile-info frames. Adds enum `shop_item_type`, tables `shop_items` and `user_shop_items`, `users.equipped_avatar_frame_id`/`users.equipped_profile_frame_id`, function `is_shop_admin()` (email-whitelist based, no `is_admin` column), and function `purchase_shop_item(...)` (security definer, atomic coin deduction + inventory insert). The migration is self-sufficient — it (re)creates `public.users` and the points/coins columns if the earlier pending migrations were never applied — so it can be run standalone in the SQL Editor.

## Current Remote State

Expected remote state after the user-applied SQL includes the lobby/gameplay schema from `202606030001_wolf_multiplayer_lobby.sql`, `202606030002_wolf_gameplay.sql`, and `202606030003_wolf_phase_confirmations.sql`, plus the applied extra role enum values from `202606120001_wolf_extra_roles.sql` and the third center target column from `202606120002_wolf_action_third_center_target.sql`.

## Pending Local Migrations

Local migration file created in this task and still pending manual remote apply:

- `supabase/migrations/202606030004_wolf_remove_presence_columns.sql`
- `supabase/migrations/202606040001_wolf_player_avatars.sql`
- `supabase/migrations/202606040002_wolf_vote_skip.sql`
- `supabase/migrations/202606050001_wolf_cleanup_old_rooms.sql`
- `supabase/migrations/202607270001_wolf_doppelganger_role.sql`
- `supabase/migrations/202607280001_classic_wolf_state.sql`
- `supabase/migrations/202607300001_wolf_avatar_key_new_assets.sql`
- `supabase/migrations/202608110001_wolf_room_visibility.sql`
- `supabase/migrations/202608110002_wolf_hourly_room_maintenance.sql`
- `supabase/migrations/202608120001_wolf_result_snapshot.sql`
- `supabase/migrations/202608170001_wolf_avatar_key_all_assets.sql`
- `supabase/migrations/202608180001_wolf_player_avatar_objects.sql`
- `supabase/migrations/202608180002_user_profiles.sql`
- `supabase/migrations/202608250001_wolf_scoring_currency.sql`
- `supabase/migrations/202608260001_shop_items.sql`

## Intended Schema After Applying Pending Migrations

### Enums

- `public.wolf_room_status`: `waiting`, `playing`, `finished`
- `public.wolf_game_phase`: `card_reveal`, `night`, `night_review`, `discussion`, `voting`, `result`
- `public.wolf_role`: `werewolf`, `werewolf_seer`, `villager`, `seer`, `robber`, `troublemaker`, `witch`, `drunk`, `insomniac`, `doppelganger`, `copycat`
- `public.shop_item_type`: `avatar_frame`, `profile_frame`. **Pending apply**: thêm bởi `202608260001_shop_items.sql`.

### Tables

#### `public.users`

Hồ sơ người chơi cho tài khoản đăng nhập Google. **Pending apply**: thêm bởi `202608180002_user_profiles.sql`.

- `id uuid primary key references auth.users(id) on delete cascade`
- `email text null`
- `display_name text null` — tên hiển thị trong game
- `avatar_key text not null default 'avatar0'`
- `avatar_object_key text null` — object key avatar upload lên R2 hoặc URL ảnh đại diện Google đã validate (nếu có)
- `total_points integer not null default 0` — tổng điểm xếp hạng, cộng dồn qua `award_wolf_game_points(...)`. **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`.
- `total_coins integer not null default 0` — tổng Xu (tiền tệ trong app), cộng dồn cùng lúc với điểm. **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`.
- `equipped_avatar_frame_id uuid null references public.shop_items(id) on delete set null` — khung avatar đang trang bị. **Pending apply**: thêm bởi `202608260001_shop_items.sql`.
- `equipped_profile_frame_id uuid null references public.shop_items(id) on delete set null` — khung thông tin người chơi đang trang bị. **Pending apply**: thêm bởi `202608260001_shop_items.sql`.
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()` (trigger `set_users_updated_at`)
- RLS bật; mỗi user tự select/insert/update hàng của mình (`auth.uid() = id`), **hoặc** admin (`is_shop_admin()`) đọc/sửa được mọi hàng — mở rộng bởi `202608260001_shop_items.sql` cho trang `/admin/users`. Client đọc/ghi trực tiếp bằng JWT. Trigger `enforce_equipped_shop_items` (từ cùng migration) chặn set `equipped_avatar_frame_id`/`equipped_profile_frame_id` sang vật phẩm sai loại hoặc chưa sở hữu.

#### `public.shop_items`

Vật phẩm bán trong shop (khung avatar, khung thông tin người chơi). **Pending apply**: thêm bởi `202608260001_shop_items.sql`.

- `id uuid primary key default gen_random_uuid()`
- `item_type public.shop_item_type not null`
- `name text not null`, độ dài 1-60
- `description text null`, tối đa 200 ký tự
- `price_coins integer not null default 0`, giá bán bằng Xu, `>= 0`
- `image_url text not null` — URL ảnh (admin nhập tay, ví dụ URL public trên Cloudflare R2)
- `is_active boolean not null default true` — chỉ vật phẩm `true` hiện trên shop cho user thường
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()` (trigger `set_shop_items_updated_at`)
- RLS bật; select cho phép `is_active = true` hoặc admin (`is_shop_admin()`); insert/update/delete chỉ admin.

#### `public.user_shop_items`

Kho vật phẩm đã mua của user. **Pending apply**: thêm bởi `202608260001_shop_items.sql`.

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.users(id) on delete cascade`
- `item_id uuid not null references public.shop_items(id) on delete cascade`
- `price_paid_coins integer not null default 0` — snapshot giá tại thời điểm mua (phòng khi admin đổi giá sau)
- `purchased_at timestamptz not null default now()`
- Unique `(user_id, item_id)` — mỗi vật phẩm chỉ mua một lần
- RLS bật; select cho `auth.uid() = user_id` hoặc admin. Không có policy insert/update/delete cho client — chỉ ghi qua function `purchase_shop_item(...)`.

#### `public.wolf_rooms`

- `id uuid primary key default gen_random_uuid()`
- `code text not null unique`, constrained to 4 lowercase letters
- `game_key text not null default 'wolf'`
- `is_public boolean not null default true`
- `status public.wolf_room_status not null default 'waiting'`
- `host_player_id uuid null references public.wolf_room_players(id) on delete set null`
- `current_game_id uuid null references public.wolf_game_sessions(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.wolf_room_players`

- `id uuid primary key default gen_random_uuid()`
- `room_id uuid not null references public.wolf_rooms(id) on delete cascade`
- `session_id text not null`
- `name text not null`, trimmed length 1-32
- `avatar_key text not null default 'avatar0'`, constrained to available avatar asset keys
- `avatar_object_key text null` — object key của avatar upload lên Cloudflare R2 (folder `avatar/`, bucket `uploads`) hoặc URL ảnh đại diện Google đã validate. Cơ chế dùng chung cho **toàn app**: mọi game (wolf, wolf-classic, avalon) đều chia sẻ bảng `wolf_room_players`, nên một cột này phục vụ tất cả game. **Pending apply**: thêm bởi `202608180001_wolf_player_avatar_objects.sql`, cần chạy thủ công trong Supabase SQL Editor. Khi cột chưa tồn tại, code tự fallback về `avatar_key`.
- `user_id uuid null references public.users(id) on delete set null` — liên kết hàng người chơi trong phòng với tài khoản đã đăng nhập (Google). Null cho guest. **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`. Dùng để xác định ai được cộng điểm/Xu khi ván Ma Sói Một Đêm kết thúc. Khi cột chưa tồn tại, code tự fallback coi mọi người chơi là guest (không cộng điểm/Xu).
- `is_host boolean not null default false`
- `is_ready boolean not null default false`
- `joined_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.wolf_game_sessions`

- `id uuid primary key default gen_random_uuid()`
- `room_id uuid not null references public.wolf_rooms(id) on delete cascade`
- `phase public.wolf_game_phase not null default 'night'`
- `round_number integer not null default 1`
- `discussion_ends_at timestamptz null`
- `result_snapshot jsonb null`, frozen Ma Sói Một Đêm result payload independent from active room membership
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.classic_wolf_game_states`

- `game_id uuid primary key references public.wolf_game_sessions(id) on delete cascade`
- `state jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- RLS enabled with no public read policy because this JSON contains secret Ma Sói nhiều đêm role/action state. Server actions read and write it with the service role.

#### `public.wolf_game_cards`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `player_id uuid null references public.wolf_room_players(id) on delete cascade`
- `center_index integer null`, constrained to 0-2 for center cards
- `original_role public.wolf_role not null`
- `"current_role" public.wolf_role not null`
- `created_at timestamptz not null default now()`

#### `public.wolf_game_actions`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `player_id uuid not null references public.wolf_room_players(id) on delete cascade`
- `action_type text not null`
- `target_player_id uuid null references public.wolf_room_players(id) on delete set null`
- `target_player_id_2 uuid null references public.wolf_room_players(id) on delete set null`
- `target_player_id_3 uuid null references public.wolf_room_players(id) on delete set null`
- `target_center_index integer null`, constrained to 0-2
- `target_center_index_2 integer null`, constrained to 0-2
- `target_center_index_3 integer null`, constrained to 0-2
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.wolf_game_votes`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `voter_player_id uuid not null references public.wolf_room_players(id) on delete cascade`
- `target_player_id uuid null references public.wolf_room_players(id) on delete cascade`
- `is_skip boolean not null default false`, true when the voter intentionally skips voting for a player
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.player_score_events`

Sổ ghi nhận điểm/Xu từng ván cho user đã đăng nhập. **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`. Cố ý KHÔNG cascade theo `wolf_rooms`/`wolf_game_sessions` vì phòng bị dọn dẹp định kỳ (xem `maintain_wolf_rooms`) — sổ này phải sống sót sau khi phòng bị xoá.

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.users(id) on delete cascade`
- `game_key text not null` — hiện chỉ `'wolf'` (Ma Sói Một Đêm); dự kiến mở rộng cho `wolf-classic`/`avalon` sau
- `game_id uuid not null` — id của `wolf_game_sessions`, lưu giá trị plain (không FK) để không phụ thuộc vòng đời phòng
- `room_code text not null` — snapshot mã phòng phục vụ audit/lịch sử sau khi phòng đã bị xoá
- `team text not null` — `'villagers'` hoặc `'werewolves'`
- `role text not null` — vai trò cuối game (finalTeamRole) của người chơi
- `is_winner boolean not null`
- `points_awarded integer not null default 0`
- `coins_awarded integer not null default 0`
- `created_at timestamptz not null default now()`
- Unique `(game_id, user_id)` — chống trao điểm/Xu trùng nếu action chạy lại
- RLS bật; user chỉ đọc được hàng của chính mình (`auth.uid() = user_id`). Không có policy insert/update/delete cho client — chỉ ghi qua function `award_wolf_game_points(...)` chạy bằng service role.

#### `public.leaderboard` (view)

View công khai cho bảng xếp hạng, không lộ `email`. **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`. Select từ `public.users`, sort theo `total_points desc, total_coins desc`. Grant select cho `anon` và `authenticated`.

- `id`, `display_name`, `avatar_key`, `avatar_object_key`, `total_points`, `total_coins`

#### `public.wolf_game_phase_confirmations`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `player_id uuid not null references public.wolf_room_players(id) on delete cascade`
- `phase public.wolf_game_phase not null`
- `created_at timestamptz not null default now()`

### Indexes And Constraints

- Room lookup indexes on `wolf_rooms.code` and `wolf_rooms.status`
- Public room list partial index on `wolf_rooms(game_key, updated_at desc) where is_public = true and status = 'waiting'`
- Player lookup index on `wolf_room_players.room_id`
- Player activity lookup index on `wolf_room_players(room_id, updated_at desc)`
- Unique room session: `wolf_room_players(room_id, session_id)`
- Gameplay lookup indexes on `wolf_game_sessions.room_id`, `wolf_game_sessions.phase`, `wolf_game_cards.game_id`, `wolf_game_cards.player_id`, `wolf_game_actions.game_id`, `wolf_game_votes.game_id`
- Phase confirmation lookup index on `wolf_game_phase_confirmations.game_id`
- Classic Ma Sói state primary-key lookup on `classic_wolf_game_states.game_id`
- Unique player card per game: `wolf_game_cards(game_id, player_id) where player_id is not null`
- Unique center card per game: `wolf_game_cards(game_id, center_index) where center_index is not null`
- Unique night action per game/player: `wolf_game_actions(game_id, player_id)`
- Unique vote per game/voter: `wolf_game_votes(game_id, voter_player_id)`
- Vote target/skip consistency: `is_skip = true` requires `target_player_id is null`; `is_skip = false` requires `target_player_id is not null`
- Unique phase confirmation per game/player/phase: `wolf_game_phase_confirmations(game_id, player_id, phase)`
- Avatar key check allows `avatar0`, `img` through `img_19`, `khanh`, `duong`, `duy`, `lan`, `na`, `oanh`, and `tri`
- Result snapshot consistency: `wolf_game_sessions.result_snapshot` must be null or a JSON object

### Functions And Scheduled Jobs

#### `public.is_shop_admin()`

- **Pending apply**: thêm bởi `202608260001_shop_items.sql`.
- `language sql stable`, so sánh `auth.jwt() ->> 'email'` với whitelist hardcode (hiện chỉ `trancatkhanh@gmail.com`).
- Dùng làm điều kiện trong RLS policy của `shop_items`, `user_shop_items`, và mở rộng của `users` — thay cho cột `is_admin` riêng (theo yêu cầu người dùng).
- Đồng bộ tay với `ADMIN_EMAILS` trong `src/lib/admin.ts` (dùng để ẩn/hiện UI `/admin`, không phải lớp bảo mật chính — `is_shop_admin()` ở Postgres mới là lớp chặn ghi thật sự).

#### `public.purchase_shop_item(p_item_id)`

- **Pending apply**: thêm bởi `202608260001_shop_items.sql`.
- `security definer`, chỉ `authenticated` gọi được (revoke khỏi `public`).
- Trong 1 transaction: khóa hàng `shop_items`/`users` (`for update`), kiểm tra vật phẩm `is_active`, chưa sở hữu, đủ Xu, rồi trừ `users.total_coins` và insert vào `user_shop_items`. Raise exception (`insufficient_coins`, `item_already_owned`, `item_not_available`, `not_authenticated`) khi thất bại — chặn gian lận/race từ client vì client không có quyền tự ghi trực tiếp hai bảng này.
- Gọi từ `src/lib/shop.ts` (`purchaseShopItem`) bằng JWT của chính user mua hàng.

#### `public.award_wolf_game_points(p_game_id, p_room_code, p_game_key, p_awards)`

- **Pending apply**: thêm bởi `202608250001_wolf_scoring_currency.sql`.
- Nhận `p_awards` là mảng jsonb `{ user_id, team, role, is_winner, points, coins }`.
- Insert vào `player_score_events` với `on conflict (game_id, user_id) do nothing` (idempotent), rồi cộng dồn `points_awarded`/`coins_awarded` vào `users.total_points`/`users.total_coins` trong cùng transaction.
- Gọi từ server action `src/app/games/wolf/actions.ts` (`awardWolfGameScores`) ngay sau khi ván Ma Sói Một Đêm vào phase `result` và `result_snapshot` được lưu lần đầu.
- Function execution is revoked from `PUBLIC` and granted to `service_role`.

#### `public.cleanup_old_wolf_rooms(...)`

- Returns counts for deleted room groups.
- Deletes old `finished` rooms after the configured `finished_older_than` interval, default `7 days`.
- Deletes `playing` rooms whose `current_game_id` is already in phase `result` after the configured `completed_playing_older_than` interval, default `7 days`.
- Deletes empty `waiting` rooms with no players after the configured `empty_waiting_older_than` interval, default `1 day`.
- Deletes stale `waiting` rooms after the configured `stale_waiting_older_than` interval, default `14 days`.
- Related `wolf_room_players`, `wolf_game_sessions`, `wolf_game_cards`, `wolf_game_actions`, `wolf_game_votes`, and `wolf_game_phase_confirmations` rows are removed by existing `ON DELETE CASCADE` constraints.
- Function execution is revoked from `PUBLIC` and granted to `service_role`.

#### `public.close_inactive_wolf_rooms(...)`

- Returns counts for closed waiting and playing rooms.
- Marks `waiting` rooms as `finished` when the latest lobby activity is older than `waiting_inactive_older_than`, default `2 hours`.
- Marks `playing` rooms as `finished` when the latest game activity is older than `playing_inactive_older_than`, default `30 minutes`.
- Activity is calculated from room, player, game session, action, vote, phase confirmation, and Classic Wolf state timestamps.
- Function execution is revoked from `PUBLIC` and granted to `service_role`.

#### `public.maintain_wolf_rooms(...)`

- Runs `close_inactive_wolf_rooms(...)`, then `cleanup_old_wolf_rooms(...)`.
- Defaults to closing inactive waiting rooms after `2 hours`, inactive playing rooms after `30 minutes`, and deleting closed room data after `1 hour`.
- Related rows are deleted through the existing cascade constraints when the room row is deleted.
- Function execution is revoked from `PUBLIC` and granted to `service_role`.

#### Cron Job

- `wolf-hourly-room-maintenance`: scheduled via `pg_cron` to run hourly at minute `17` database time.
- Command: `select public.maintain_wolf_rooms();`
- The migration unschedules the older daily `wolf-cleanup-old-rooms` job when present.

## Remote Apply Notes

Supabase Management API project linking remains unavailable from this workspace due token privileges, but direct session pooler execution worked for `202606120001_wolf_extra_roles.sql` and `202606120002_wolf_action_third_center_target.sql`.

On 2026-08-17, remote apply for `202608170001_wolf_avatar_key_all_assets.sql` was attempted from this workspace. Management API database query returned 403, the direct database host could not be used by Supabase CLI from this network, and the tested `ap-southeast-1` session pooler returned tenant/user not found. Apply the remaining pending SQL manually in Supabase SQL Editor unless a working migration execution path is provided.

