<!-- Last updated: 2026-08-26 -->

# Migrations

## 202606030001_wolf_multiplayer_lobby.sql

Status: user reported manually applied in Supabase SQL Editor.

Path:

- `supabase/migrations/202606030001_wolf_multiplayer_lobby.sql`

Purpose:

- Add Phase 1 Ma Sói realtime multiplayer lobby schema.
- Create room and player tables.
- Enable RLS with public read-only policies for lobby sync.
- Add tables to `supabase_realtime` publication.

## 202606030002_wolf_gameplay.sql

Status: user reported manually applied in Supabase SQL Editor.

Path:

- `supabase/migrations/202606030002_wolf_gameplay.sql`

Purpose:

- Add Phase 2 Ma Sói gameplay schema.
- Create `wolf_game_phase` and `wolf_role` enums.
- Add `current_game_id` to `wolf_rooms`.
- Create gameplay tables: `wolf_game_sessions`, `wolf_game_cards`, `wolf_game_actions`, `wolf_game_votes`.
- Add indexes and uniqueness constraints for card ownership, one action per player, and one vote per voter.
- Enable RLS with public read-only policies for realtime game state sync.
- Add gameplay tables to `supabase_realtime` publication.

## 202606030003_wolf_phase_confirmations.sql

Status: user reported manually applied in Supabase SQL Editor.

Path:

- `supabase/migrations/202606030003_wolf_phase_confirmations.sql`

Purpose:

- Add `card_reveal` and `night_review` values to `wolf_game_phase`.
- Create `wolf_game_phase_confirmations` for per-player phase-ready confirmations.
- Add lookup and uniqueness indexes for confirmation state.
- Enable RLS with public read-only policy for realtime phase status.
- Add phase confirmation table to `supabase_realtime` publication.

## 202606030004_wolf_remove_presence_columns.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202606030004_wolf_remove_presence_columns.sql`

Purpose:

- Remove heartbeat/presence tracking from Ma Sói rooms.
- Delete old player rows that were previously marked with `left_at`.
- Drop `left_at` and `last_seen_at` from `wolf_room_players`.
- Replace the partial active-session unique index with a regular unique index on `(room_id, session_id)`.

## 202606040001_wolf_player_avatars.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202606040001_wolf_player_avatars.sql`

Purpose:

- Add `avatar_key` to `wolf_room_players`.
- Default existing and new players to `avatar0`.
- Constrain saved avatar keys to the available files under `public/images/avatars`.

## 202606040002_wolf_vote_skip.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202606040002_wolf_vote_skip.sql`

Purpose:

- Add `is_skip` to `wolf_game_votes`.
- Allow `target_player_id` to be null for skipped votes.
- Add a check constraint so each vote is either a player vote or an intentional skip.

## 202606050001_wolf_cleanup_old_rooms.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202606050001_wolf_cleanup_old_rooms.sql`

Purpose:

- Create `public.cleanup_old_wolf_rooms(...)` to delete old Ma Sói rooms and rely on existing cascade constraints for related room/gameplay rows.
- Delete `finished` rooms older than 7 days by default.
- Delete `playing` rooms whose current game is already in phase `result` and older than 7 days by default.
- Delete empty `waiting` rooms older than 1 day by default.
- Delete stale `waiting` rooms older than 14 days by default.
- Enable `pg_cron` and schedule `wolf-cleanup-old-rooms` daily at `03:17` database time.

## 202606120001_wolf_extra_roles.sql

Status: applied remotely on 2026-06-12 via Supabase CLI `db query` over the session pooler; enum values verified after apply.

Path:

- `supabase/migrations/202606120001_wolf_extra_roles.sql`

Purpose:

- Add `werewolf_seer`, `witch`, and `copycat` values to `public.wolf_role`.
- Support selectable role setup and the new night actions for Sói Tiên Tri, Phù Thuỷ, and Copy Cat.

## 202606120002_wolf_action_third_center_target.sql

Status: applied remotely on 2026-06-12 via Supabase CLI `db query` over the session pooler; column and check constraint verified after apply.

Path:

- `supabase/migrations/202606120002_wolf_action_third_center_target.sql`

Purpose:

- Add `target_center_index_3` to `public.wolf_game_actions`.
- Allow Copy Cat copying Tiên Tri to copy one center card, then inspect two additional center cards.
- Constrain the third center target to index 0-2 when present.

## 202607270001_wolf_doppelganger_role.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202607270001_wolf_doppelganger_role.sql`

Purpose:

- Add `doppelganger` to `public.wolf_role` for Nhân Bản.
- Add `target_player_id_3` to `public.wolf_game_actions` so Nhân Bản copying Kẻ Gây Rối can store two copied-role targets while `target_player_id` stores the copied player.
- Keep the new target linked to `wolf_room_players(id)` with `on delete set null`.
- This migration depends on `202606030002_wolf_gameplay.sql`; apply base gameplay migrations first on a fresh database.

## 202607280001_classic_wolf_state.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202607280001_classic_wolf_state.sql`

Purpose:

- Create `public.classic_wolf_game_states` keyed by `game_id`.
- Store Ma Sói nhiều đêm role assignments, alive/dead state, night actions, day votes, witch potion usage, hunter shots, death announcements, and winner state in a separate JSON table.
- Keep one-night Ma Sói gameplay tables, columns, indexes, action uniqueness, and vote uniqueness unchanged.
- Enable RLS on the new state table with no public read policy because the JSON contains secret role/action state and is accessed through server actions.
- This migration depends on `202606030002_wolf_gameplay.sql`; apply base gameplay migrations first on a fresh database.

## 202607300001_wolf_avatar_key_new_assets.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202607300001_wolf_avatar_key_new_assets.sql`

Purpose:

- Update `wolf_room_players_avatar_key_check` to allow the named avatar asset keys `khanh`, `duong`, `duy`, `lan`, `na`, `oanh`, and `tri`.
- Keep the existing avatar keys valid and append the new choices after the current avatar list in the app.
- This migration depends on `202606040001_wolf_player_avatars.sql`; apply the avatar column migration first on a fresh database.

## 202608110001_wolf_room_visibility.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608110001_wolf_room_visibility.sql`

Purpose:

- Add `is_public` to `wolf_rooms`, defaulting existing and new rooms to public.
- Add a partial index for public waiting room list queries by `game_key`.
- Replace lobby read policies so anonymous/authenticated direct reads only expose public rooms and players in public rooms.
- Private rooms remain joinable by code through server actions that use the service role.

## 202608110002_wolf_hourly_room_maintenance.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608110002_wolf_hourly_room_maintenance.sql`

Purpose:

- Add `updated_at` to `wolf_room_players` and a trigger so lobby actions such as ready/name/avatar updates count as activity.
- Create `public.close_inactive_wolf_rooms(...)` to mark inactive waiting/playing rooms as `finished`.
- Create `public.maintain_wolf_rooms(...)` to close inactive rooms, then delete closed room data through the existing cascade cleanup.
- Replace the older daily `wolf-cleanup-old-rooms` cron job with `wolf-hourly-room-maintenance`, scheduled hourly at minute `17`.
- Default thresholds: close inactive waiting rooms after `2 hours`, close inactive playing rooms after `30 minutes`, delete closed room data after `1 hour`.

## 202608120001_wolf_result_snapshot.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608120001_wolf_result_snapshot.sql`

Purpose:

- Add `result_snapshot jsonb` to `wolf_game_sessions`.
- Store a frozen Ma Sói Một Đêm result payload when the game enters `result`.
- Keep winner text, vote counts, all player role summaries, and night movement logs available even if players leave the room and their live membership/gameplay rows are later deleted.
- Add a check constraint requiring the snapshot to be null or a JSON object.

## 202608170001_wolf_avatar_key_all_assets.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608170001_wolf_avatar_key_all_assets.sql`

Purpose:

- Repair `wolf_room_players_avatar_key_check` for databases that already applied an older named-avatar constraint without `duy`, `na`, and `oanh`.
- Keep the database constraint aligned with `PLAYER_AVATAR_KEYS` in `src/lib/player-avatars.ts`.
- This migration depends on `202606040001_wolf_player_avatars.sql`; apply the avatar column migration first on a fresh database.

## 202608180001_wolf_player_avatar_objects.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608180001_wolf_player_avatar_objects.sql`

Purpose:

- Add `public.wolf_room_players.avatar_object_key text null` để lưu object key của avatar do người chơi upload lên Cloudflare R2 (folder `avatar/`, bucket `uploads`) hoặc URL ảnh đại diện Google đã validate.
- Cơ chế dùng chung cho toàn app: mọi game (wolf, wolf-classic, avalon) đều chia sẻ bảng `wolf_room_players` (phân biệt game bằng `game_key` trên `wolf_rooms`), nên chỉ cần một cột này cho tất cả game.
- Khi cột chưa tồn tại, code phía server tự fallback về `avatar_key` (xem `isMissingAvatarObjectKeyColumnError`), nên avatar preset vẫn hoạt động; chỉ avatar upload cần cột này.

## 202608180002_user_profiles.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608180002_user_profiles.sql`

Purpose:

- Tạo bảng `public.users` (id = `auth.users.id`) lưu hồ sơ người chơi cho tài khoản đã đăng nhập Google: `email`, `display_name`, `avatar_key`, `avatar_object_key` (object key R2 hoặc URL ảnh đại diện Google đã validate), timestamps.
- Bật RLS + policy cho phép mỗi user tự select/insert/update **hàng của mình** (`auth.uid() = id`) — client (đã có JWT) đọc/ghi trực tiếp, không cần server action.
- Trigger `set_users_updated_at` tự cập nhật `updated_at` khi sửa.
- Dùng cho trang `/profile` (sửa tên hiển thị + avatar mặc định) và tạo record tự động khi login lần đầu (`ensureMyProfile`).

## 202608250001_wolf_scoring_currency.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608250001_wolf_scoring_currency.sql`

Purpose:

- Add hệ thống tính điểm (points) và tiền tệ Xu (coins) cho Ma Sói Một Đêm — chỉ áp dụng cho user đã đăng nhập.
- Add `wolf_room_players.user_id` (nullable, references `public.users`) để liên kết một lượt chơi trong phòng với tài khoản đăng nhập; null cho guest.
- Add `users.total_points` và `users.total_coins` (denormalized, cộng dồn) phục vụ bảng xếp hạng.
- Create `public.player_score_events`, sổ ghi nhận điểm/Xu từng ván, không cascade theo `wolf_rooms` (phòng bị dọn dẹp định kỳ), unique `(game_id, user_id)` chống cộng trùng.
- Create view `public.leaderboard` (không lộ email) cho trang xếp hạng đọc công khai.
- Create function `public.award_wolf_game_points(...)` (`security definer`, chỉ `service_role` gọi được) để insert ledger + cộng dồn điểm/Xu trong một transaction, idempotent qua unique constraint.
- Công thức: Dân làng thắng +5 điểm/+3 Xu mỗi người phe Dân; Ma Sói thắng +10 điểm/+5 Xu mỗi người phe Sói (gấp đôi vì phe Sói khó thắng hơn); phe thua bị trừ 2 điểm, Xu giữ nguyên (không trừ).
- Gọi từ `setWolfGameResultPhase(...)` trong `src/app/games/wolf/actions.ts` ngay khi ván vào phase `result` lần đầu, và từ nhánh fallback trong `leaveWolfRoom(...)` nếu snapshot chưa từng được lưu.
- Code có fallback graceful khi cột/bảng/view/function này chưa tồn tại trên remote (xem `isMissingUserIdColumnError` trong `src/lib/supabase/errors.ts`): tạo/vào phòng vẫn hoạt động bình thường, chỉ là chưa cộng điểm/Xu, trang `/board` hiển thị trạng thái rỗng thay vì lỗi.

## 202608260001_shop_items.sql

Status: created locally, pending manual remote apply.

Path:

- `supabase/migrations/202608260001_shop_items.sql`

Purpose:

- Add shop feature: mua vật phẩm trang trí (khung avatar, khung thông tin người chơi) bằng Xu (`users.total_coins`).
- File TỰ ĐỦ (self-contained): cũng tạo lại `public.users` + cột `total_points`/`total_coins` nếu `202608180002_user_profiles.sql`/`202608250001_wolf_scoring_currency.sql` chưa được apply, để không phụ thuộc thứ tự chạy migration thủ công.
- Create enum `public.shop_item_type` (`avatar_frame`, `profile_frame`).
- Create `public.shop_items` (tên, mô tả, giá Xu, `image_url`, `is_active`, `sort_order`). Client thường chỉ đọc được `is_active = true`; admin đọc/ghi mọi vật phẩm.
- Create `public.user_shop_items` (kho vật phẩm đã mua), unique `(user_id, item_id)`. Không có policy insert/update/delete cho client — chỉ ghi qua function `purchase_shop_item(...)`.
- Add `users.equipped_avatar_frame_id` và `users.equipped_profile_frame_id` (nullable, ref `shop_items`). Trigger `enforce_equipped_shop_items` chặn trang bị vật phẩm sai loại hoặc chưa sở hữu.
- Create function `public.is_shop_admin()` — kiểm tra `auth.jwt() ->> 'email'` so với whitelist hardcode (hiện chỉ `trancatkhanh@gmail.com`, đồng bộ tay với `ADMIN_EMAILS` trong `src/lib/admin.ts`). Dùng làm điều kiện RLS cho các bảng/chức năng quản trị — không tạo cột `is_admin` riêng theo yêu cầu người dùng.
- Mở rộng policy `users_select_own`/`users_update_own` cho phép admin đọc/sửa mọi user (trang `/admin/users`).
- Create function `public.purchase_shop_item(p_item_id)` (`security definer`, chỉ `authenticated` gọi được) — trừ Xu + insert vào kho trong 1 transaction, chống gian lận/race từ client.
- Dùng cho trang `/shop` (mua/trang bị vật phẩm) và `/admin/items`, `/admin/users` (CRUD vật phẩm, xem/sửa Xu người dùng). Code có fallback graceful khi bảng chưa tồn tại (`isMissingTableError` trong `src/lib/supabase/errors.ts`): trang shop hiển thị thông báo "chưa sẵn sàng" thay vì lỗi.

## Remote Execution Status

Remote execution attempts on 2026-06-03 from this workspace were blocked:

- Supabase Management API `POST /v1/projects/{ref}/database/query`: blocked by insufficient token privileges.
- Direct Postgres pooler connection: blocked by tenant/user lookup failure with available project ref/password.
- Supabase REST verification: `public.wolf_rooms` not found in schema cache.

Remote execution update on 2026-06-12:

- Supabase Management API project link remained blocked by token privileges.
- Direct session pooler execution succeeded for `202606120001_wolf_extra_roles.sql`.
- Verified `public.wolf_role` now includes `werewolf_seer`, `witch`, and `copycat`.
- Direct session pooler execution succeeded for `202606120002_wolf_action_third_center_target.sql`.
- Verified `public.wolf_game_actions.target_center_index_3` and `wolf_game_actions_center_index_3_check`.

Remote execution update on 2026-08-17:

- Supabase Management API database query for the avatar constraint returned 403.
- Supabase CLI direct database query could not use the project database host from this workspace.
- Supabase CLI query through the tested `ap-southeast-1` session pooler returned tenant/user not found.
- `202608170001_wolf_avatar_key_all_assets.sql` remains pending manual remote apply.

Required next action:

- If `202606030001`, `202606030002`, and `202606030003` are already applied, apply `202606030004_wolf_remove_presence_columns.sql`, `202606040001_wolf_player_avatars.sql`, `202606040002_wolf_vote_skip.sql`, `202606050001_wolf_cleanup_old_rooms.sql`, `202607270001_wolf_doppelganger_role.sql`, `202607280001_classic_wolf_state.sql`, `202607300001_wolf_avatar_key_new_assets.sql`, `202608110001_wolf_room_visibility.sql`, `202608110002_wolf_hourly_room_maintenance.sql`, `202608120001_wolf_result_snapshot.sql`, `202608170001_wolf_avatar_key_all_assets.sql`, `202608180001_wolf_player_avatar_objects.sql`, `202608180002_user_profiles.sql`, `202608250001_wolf_scoring_currency.sql`, and `202608260001_shop_items.sql` (apply after `202608180002_user_profiles.sql` since it depends on `public.users`) in Supabase SQL Editor.
- If starting from a clean database, apply all SQL files manually in filename order, or provide a Management API token / database connection string with permission to run migrations.
- On 2026-08-26, `202608260001_shop_items.sql` (shop feature) was created for this same reason: this workspace could not `supabase link`/`db push` (blocked by the sandbox's auto-mode classifier before even reaching the network) or reach the Supabase Management API/session pooler directly. The migration is written to be self-sufficient (creates `public.users` + points/coins columns if missing) so it can be pasted into the SQL Editor regardless of which earlier pending migrations were already applied.

