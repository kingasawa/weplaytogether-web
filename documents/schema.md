<!-- Last updated: 2026-06-03 -->

# Database Schema

## Verified Scope

This document tracks the Ma Sói multiplayer lobby and gameplay schema status.

Earlier verification on 2026-06-03 via Supabase REST returned `PGRST205` for `public.wolf_rooms`. The user later reported successful manual SQL execution for the lobby/gameplay migrations in Supabase SQL Editor. This task did not execute or re-verify remote schema directly.

## Current Remote State

Expected remote state after the user-applied SQL includes the lobby/gameplay schema from `202606030001_wolf_multiplayer_lobby.sql`, `202606030002_wolf_gameplay.sql`, and `202606030003_wolf_phase_confirmations.sql`.

## Pending Local Migrations

Local migration file created in this task and still pending manual remote apply:

- `supabase/migrations/202606030004_wolf_remove_presence_columns.sql`

## Intended Schema After Applying Pending Migrations

### Enums

- `public.wolf_room_status`: `waiting`, `playing`, `finished`
- `public.wolf_game_phase`: `card_reveal`, `night`, `night_review`, `discussion`, `voting`, `result`
- `public.wolf_role`: `werewolf`, `villager`, `seer`, `robber`, `troublemaker`, `drunk`, `insomniac`

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
- `target_center_index integer null`, constrained to 0-2
- `target_center_index_2 integer null`, constrained to 0-2
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

#### `public.wolf_game_votes`

- `id uuid primary key default gen_random_uuid()`
- `game_id uuid not null references public.wolf_game_sessions(id) on delete cascade`
- `voter_player_id uuid not null references public.wolf_room_players(id) on delete cascade`
- `target_player_id uuid not null references public.wolf_room_players(id) on delete cascade`
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
- Unique phase confirmation per game/player/phase: `wolf_game_phase_confirmations(game_id, player_id, phase)`

## Remote Apply Blocker

Automated remote migration execution remains unavailable from this workspace. Apply pending SQL manually in Supabase SQL Editor unless a working migration execution path is provided.
