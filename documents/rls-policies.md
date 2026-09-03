<!-- Last updated: 2026-09-03 -->

# RLS Policies

## `public.users` (202608180002_user_profiles.sql — pending apply; policies replaced by 202608260001_shop_items.sql — pending apply)

RLS bật. Mỗi user thao tác hàng của chính mình, **hoặc** admin (`is_shop_admin()`) thao tác được mọi hàng:

- `users_select_own`: `for select using (auth.uid() = id or public.is_shop_admin())`
- `users_insert_own`: `for insert with check (auth.uid() = id)`
- `users_update_own`: `for update using (auth.uid() = id or public.is_shop_admin()) with check (auth.uid() = id or public.is_shop_admin())`

Không có policy delete (không cho xóa hồ sơ từ client). Trigger `trg_enforce_equipped_shop_items` (`enforce_equipped_shop_items()`, security definer) chạy trước mọi update, chặn set `equipped_avatar_frame_id`/`equipped_profile_frame_id` sang vật phẩm sai loại hoặc user chưa sở hữu trong `user_shop_items`.

`202609030001_user_level_system.sql` thêm trigger `trg_protect_user_progression_stats` (`protect_user_progression_stats()`, security definer) chạy trước mọi insert/update trên `public.users`. Trigger này chặn client thường tự set/sửa `total_points`, `total_coins`, hoặc `level_xp` qua policy `users_insert_own`/`users_update_own`; chỉ trusted RPC (`app.user_stat_update = trusted`), `service_role`, hoặc admin (`is_shop_admin()`) được sửa các cột progression/economy này.

## `public.shop_items` (202608260001_shop_items.sql — pending apply)

RLS bật:

- `shop_items_select_active_or_admin`: `for select using (is_active = true or public.is_shop_admin())`
- `shop_items_admin_write`: `for all using (public.is_shop_admin()) with check (public.is_shop_admin())` — cho phép admin insert/update/delete.

User thường chỉ đọc được vật phẩm `is_active = true`, không ghi được. Admin (theo whitelist email trong `is_shop_admin()`) đọc/ghi mọi vật phẩm trực tiếp bằng JWT của chính họ (không cần service role) — trang `/admin/items`.

## `public.user_shop_items` (202608260001_shop_items.sql — pending apply)

RLS bật:

- `user_shop_items_select_own_or_admin`: `for select using (auth.uid() = user_id or public.is_shop_admin())`

Không có policy insert/update/delete cho client — chỉ ghi qua function `purchase_shop_item(p_item_id)` (`security definer`, chỉ `authenticated` gọi được), để không cho client tự thêm vật phẩm vào kho hoặc gian lận Xu.

## `public.player_score_events` (202608250001_wolf_scoring_currency.sql — pending apply; extended by 202609030001_user_level_system.sql — pending apply)

RLS bật:

- `player_score_events_select_own`: `for select using (auth.uid() = user_id)`

Không có policy insert/update/delete cho client — chỉ ghi qua function `award_wolf_game_points(...)` (`security definer`, chạy bằng service role, execute chỉ grant cho `service_role`). Migration `202609030001_user_level_system.sql` thêm `xp_awarded` vào ledger nhưng không thêm policy ghi mới.

## `public.leaderboard` (view, 202608250001_wolf_scoring_currency.sql — pending apply; extended by 202609030001_user_level_system.sql — pending apply)

Không phải bảng nên không có RLS trực tiếp; view select từ `public.users` và được tạo bởi role có `bypassrls` (Supabase SQL Editor), nên trả về toàn bộ user bất kể RLS của `public.users` chỉ cho tự đọc hàng của mình. Cột hiển thị không gồm `email`. `grant select` cho `anon` và `authenticated`. Migration `202609030001_user_level_system.sql` thêm `level_xp`, `level`, và `level_tier` vào view.

## Current Remote State

The user reported successful manual SQL execution for the lobby/gameplay migrations, so the policies from `202606030001` and `202606030002` are expected to exist remotely. This task did not execute or re-verify remote RLS directly.

## Pending Local Migration Policies

### `202606030001_wolf_multiplayer_lobby.sql`

The pending lobby migration defines these read policies after enabling RLS:

- `Public read wolf rooms` on `public.rooms`
- `Public read wolf room players` on `public.room_players`

### `202606030002_wolf_gameplay.sql`

The pending gameplay migration defines these read policies after enabling RLS:

- `Public read wolf game sessions` on `public.game_sessions`
- `Public read wolf game cards` on `public.game_cards`
- `Public read wolf game actions` on `public.game_actions`
- `Public read wolf game votes` on `public.game_votes`

### `202606030003_wolf_phase_confirmations.sql`

The pending phase confirmation migration defines this read policy after enabling RLS:

- `Public read wolf game phase confirmations` on `public.game_phase_confirmations`

### `202607280001_classic_wolf_state.sql`

The Ma Sói nhiều đêm state migration enables RLS on `public.classic_wolf_game_states` and intentionally adds no public read policy. The table stores secret role assignments, night actions, witch potion state, hunter shots, and winner state. Reads and writes are performed only through server actions using the service role key.

### `202608110001_wolf_room_visibility.sql`

The room visibility migration replaces the lobby read policies:

- `Public read wolf rooms` on `public.rooms` allows `anon` and `authenticated` to select only rows where `is_public = true`.
- `Public read wolf room players` on `public.room_players` allows `anon` and `authenticated` to select players only for rooms where `is_public = true`.

Private rooms are still read and joined through server actions using the service role after a user provides the room code.

### `202608110002_wolf_hourly_room_maintenance.sql`

The hourly room maintenance migration adds no new RLS policies. Maintenance functions run as `SECURITY DEFINER`, execution is revoked from `PUBLIC`, and execution is granted to `service_role`.

## Access Model

The policies allow `anon` and `authenticated` clients to read public room/game state for realtime updates. Private room access is routed through server actions.

Client writes are intentionally not granted. Room creation, lobby mutation, game start, night actions, phase transitions, votes, game finish, inactive-room closing, and cleanup are performed through server actions, scheduled database jobs, or service-role-only functions.

## Remote Apply Blocker

The `game_phase_confirmations` policy remains pending until `202606030003_wolf_phase_confirmations.sql` is applied manually. Automated migration execution from this workspace remains unavailable with the current credentials/connectivity.

On 2026-08-26, `202608260002_rename_shared_game_tables.sql` renamed `wolf_rooms`/`wolf_room_players`/`wolf_game_sessions`/`wolf_game_cards`/`wolf_game_actions`/`wolf_game_votes`/`wolf_game_phase_confirmations` to drop the misleading `wolf_` prefix (they're shared by all 3 games — see `documents/schema.md`). `alter table ... rename to ...` carries RLS policies over automatically (policies are stored as parsed expressions tied to the table's OID, not as text), so none of the policy *definitions* above needed changes — only which table each is attached to. The policy **names** themselves (e.g. `"Public read wolf rooms"`) were intentionally left as-is; renaming them wasn't required and wasn't part of what the user asked for. Same manual-SQL-Editor blocker applies — the Supabase MCP tool in this workspace is connected to an unrelated project ("Map Buddy"), not this app's project.

On 2026-08-26, `202608260001_shop_items.sql` (shop RLS policies above) hit the same blocker: the Supabase MCP tool available in this workspace is connected to a different Supabase account/project, and `supabase link`/`db push` was blocked by the sandbox's auto-mode classifier before it could even attempt the network call. The migration must be pasted into the Supabase SQL Editor manually, same as the other pending migrations.

## Admin Whitelist (is_shop_admin())

`public.is_shop_admin()` (defined in `202608260001_shop_items.sql`) grants elevated RLS access by comparing `auth.jwt() ->> 'email'` against a hardcoded array, currently `['trancatkhanh@gmail.com']`. This is a deliberate choice (the user asked for an email whitelist instead of an `is_admin` column) mirrored client-side in `ADMIN_EMAILS` in `src/lib/admin.ts` for hiding/showing the `/admin` UI. **The two lists must be kept in sync by hand** — adding an admin means editing both the SQL function (new migration + re-apply) and the TS constant.

