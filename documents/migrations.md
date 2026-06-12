<!-- Last updated: 2026-06-12 -->

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

Required next action:

- If `202606030001`, `202606030002`, and `202606030003` are already applied, apply `202606030004_wolf_remove_presence_columns.sql`, `202606040001_wolf_player_avatars.sql`, `202606040002_wolf_vote_skip.sql`, and `202606050001_wolf_cleanup_old_rooms.sql` in Supabase SQL Editor.
- If starting from a clean database, apply all SQL files manually in filename order, or provide a Management API token / database connection string with permission to run migrations.

