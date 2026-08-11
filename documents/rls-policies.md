<!-- Last updated: 2026-08-11 -->

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

### `202607280001_classic_wolf_state.sql`

The Ma Sói nhiều đêm state migration enables RLS on `public.classic_wolf_game_states` and intentionally adds no public read policy. The table stores secret role assignments, night actions, witch potion state, hunter shots, and winner state. Reads and writes are performed only through server actions using the service role key.

### `202608110001_wolf_room_visibility.sql`

The room visibility migration replaces the lobby read policies:

- `Public read wolf rooms` on `public.wolf_rooms` allows `anon` and `authenticated` to select only rows where `is_public = true`.
- `Public read wolf room players` on `public.wolf_room_players` allows `anon` and `authenticated` to select players only for rooms where `is_public = true`.

Private rooms are still read and joined through server actions using the service role after a user provides the room code.

### `202608110002_wolf_hourly_room_maintenance.sql`

The hourly room maintenance migration adds no new RLS policies. Maintenance functions run as `SECURITY DEFINER`, execution is revoked from `PUBLIC`, and execution is granted to `service_role`.

## Access Model

The policies allow `anon` and `authenticated` clients to read public room/game state for realtime updates. Private room access is routed through server actions.

Client writes are intentionally not granted. Room creation, lobby mutation, game start, night actions, phase transitions, votes, game finish, inactive-room closing, and cleanup are performed through server actions, scheduled database jobs, or service-role-only functions.

## Remote Apply Blocker

The `wolf_game_phase_confirmations` policy remains pending until `202606030003_wolf_phase_confirmations.sql` is applied manually. Automated migration execution from this workspace remains unavailable with the current credentials/connectivity.

