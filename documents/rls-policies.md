<!-- Last updated: 2026-06-03 -->

# RLS Policies

## Current Remote State

The user reported successful manual SQL execution for the lobby/gameplay migrations, so the policies from `202606030001` and `202606030002` are expected to exist remotely. This task did not execute or re-verify remote RLS directly.

## Pending Local Migration Policies

### `202606030001_wolf_multiplayer_lobby.sql`

The pending lobby migration defines these read policies after enabling RLS:

- `Public read wolf rooms` on `public.wolf_rooms`
- `Public read wolf room players` on `public.wolf_room_players`

### `202606030002_wolf_gameplay.sql`

The pending gameplay migration defines these read policies after enabling RLS:

- `Public read wolf game sessions` on `public.wolf_game_sessions`
- `Public read wolf game cards` on `public.wolf_game_cards`
- `Public read wolf game actions` on `public.wolf_game_actions`
- `Public read wolf game votes` on `public.wolf_game_votes`

### `202606030003_wolf_phase_confirmations.sql`

The pending phase confirmation migration defines this read policy after enabling RLS:

- `Public read wolf game phase confirmations` on `public.wolf_game_phase_confirmations`

## Access Model

The policies allow `anon` and `authenticated` clients to read room/game state for realtime updates.

Client writes are intentionally not granted. Room creation, lobby mutation, game start, night actions, phase transitions, votes, and game finish are performed through server actions using the service role key.

## Remote Apply Blocker

The `wolf_game_phase_confirmations` policy remains pending until `202606030003_wolf_phase_confirmations.sql` is applied manually. Automated migration execution from this workspace remains unavailable with the current credentials/connectivity.
