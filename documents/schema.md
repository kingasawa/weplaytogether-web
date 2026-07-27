<!-- Last updated: 2026-07-27 -->

# Database Schema

## Verified Scope

This document tracks the Ma Sói multiplayer lobby and gameplay schema status.

Earlier verification on 2026-06-03 via Supabase REST returned `PGRST205` for `public.wolf_rooms`. The user later reported successful manual SQL execution for the lobby/gameplay migrations in Supabase SQL Editor.

On 2026-06-12, `public.wolf_role` was updated and verified through Supabase CLI `db query` over the session pooler. The verified enum values are `werewolf`, `villager`, `seer`, `robber`, `troublemaker`, `drunk`, `insomniac`, `werewolf_seer`, `witch`, and `copycat`.

On 2026-06-12, `public.wolf_game_actions.target_center_index_3` and its 0-2 check constraint were added and verified through Supabase CLI `db query`.

On 2026-07-27, local migration `202607270001_wolf_doppelganger_role.sql` was created to add the pending `doppelganger` enum value and `wolf_game_actions.target_player_id_3` for Nhân Bản copying Kẻ Gây Rối.

## Current Remote State

Expected remote state after the user-applied SQL includes the lobby/gameplay schema from `202606030001_wolf_multiplayer_lobby.sql`, `202606030002_wolf_gameplay.sql`, and `202606030003_wolf_phase_confirmations.sql`, plus the applied extra role enum values from `202606120001_wolf_extra_roles.sql` and the third center target column from `202606120002_wolf_action_third_center_target.sql`.

## Pending Local Migrations

Local migration file created in this task and still pending manual remote apply:

- `supabase/migrations/202606030004_wolf_remove_presence_columns.sql`
- `supabase/migrations/202606040001_wolf_player_avatars.sql`
- `supabase/migrations/202606040002_wolf_vote_skip.sql`
- `supabase/migrations/202606050001_wolf_cleanup_old_rooms.sql`
- `supabase/migrations/202607270001_wolf_doppelganger_role.sql`

## Intended Schema After Applying Pending Migrations

### Enums

- `public.wolf_room_status`: `waiting`, `playing`, `finished`
- `public.wolf_game_phase`: `card_reveal`, `night`, `night_review`, `discussion`, `voting`, `result`
- `public.wolf_role`: `werewolf`, `werewolf_seer`, `villager`, `seer`, `robber`, `troublemaker`, `witch`, `drunk`, `insomniac`, `doppelganger`, `copycat`

### Tables

#### `public.wolf_rooms`

- `id uuid primary key default gen_random_uuid()`
- `code text not null unique`, constrained to 4 lowercase letters
- `game_key text not null default 'wolf'`
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
- `is_host boolean not null default false`
- `is_ready boolean not null default false`
- `joined_at timestamptz not null default now()`

#### `public.wolf_game_sessions`

- `id uuid primary key default gen_random_uuid()`
- `room_id uuid not null references public.wolf_rooms(id) on delete cascade`
- `phase public.wolf_game_phase not null default 'night'`
- `round_number integer not null default 1`
- `discussion_ends_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

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

#### `public.wolf_game_phase_confirmations`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `player_id uuid not null references public.wolf_room_players(id) on delete cascade`
- `phase public.wolf_game_phase not null`
- `created_at timestamptz not null default now()`

### Indexes And Constraints

- Room lookup indexes on `wolf_rooms.code` and `wolf_rooms.status`
- Player lookup index on `wolf_room_players.room_id`
- Unique room session: `wolf_room_players(room_id, session_id)`
- Gameplay lookup indexes on `wolf_game_sessions.room_id`, `wolf_game_sessions.phase`, `wolf_game_cards.game_id`, `wolf_game_cards.player_id`, `wolf_game_actions.game_id`, `wolf_game_votes.game_id`
- Phase confirmation lookup index on `wolf_game_phase_confirmations.game_id`
- Unique player card per game: `wolf_game_cards(game_id, player_id) where player_id is not null`
- Unique center card per game: `wolf_game_cards(game_id, center_index) where center_index is not null`
- Unique night action per game/player: `wolf_game_actions(game_id, player_id)`
- Unique vote per game/voter: `wolf_game_votes(game_id, voter_player_id)`
- Vote target/skip consistency: `is_skip = true` requires `target_player_id is null`; `is_skip = false` requires `target_player_id is not null`
- Unique phase confirmation per game/player/phase: `wolf_game_phase_confirmations(game_id, player_id, phase)`

### Functions And Scheduled Jobs

#### `public.cleanup_old_wolf_rooms(...)`

- Returns counts for deleted room groups.
- Deletes old `finished` rooms after the configured `finished_older_than` interval, default `7 days`.
- Deletes `playing` rooms whose `current_game_id` is already in phase `result` after the configured `completed_playing_older_than` interval, default `7 days`.
- Deletes empty `waiting` rooms with no players after the configured `empty_waiting_older_than` interval, default `1 day`.
- Deletes stale `waiting` rooms after the configured `stale_waiting_older_than` interval, default `14 days`.
- Related `wolf_room_players`, `wolf_game_sessions`, `wolf_game_cards`, `wolf_game_actions`, `wolf_game_votes`, and `wolf_game_phase_confirmations` rows are removed by existing `ON DELETE CASCADE` constraints.
- Function execution is revoked from `PUBLIC` and granted to `service_role`.

#### Cron Job

- `wolf-cleanup-old-rooms`: scheduled via `pg_cron` to run daily at `03:17` database time.
- Command: `SELECT public.cleanup_old_wolf_rooms();`

## Remote Apply Notes

Supabase Management API project linking remains unavailable from this workspace due token privileges, but direct session pooler execution worked for `202606120001_wolf_extra_roles.sql` and `202606120002_wolf_action_third_center_target.sql`. Apply the remaining pending SQL manually in Supabase SQL Editor unless a working migration execution path is provided.
