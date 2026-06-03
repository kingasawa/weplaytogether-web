<!-- Last updated: 2026-06-03 -->

# RLS Policies

## Current Remote State

No verified Ma Sói lobby RLS policies exist remotely because `public.wolf_rooms` is not present in the remote schema cache.

## Pending Local Migration Policies

The pending migration `supabase/migrations/202606030001_wolf_multiplayer_lobby.sql` defines these read policies after enabling RLS:

- `Public read wolf rooms` on `public.wolf_rooms`
- `Public read wolf room players` on `public.wolf_room_players`

These policies allow `anon` and `authenticated` clients to read lobby state for realtime updates. Client writes are intentionally not granted; room mutations are expected to go through server actions using the service role key.

## Remote Apply Blocker

The policies have not been applied remotely because migration execution is blocked by the current Supabase credentials/connectivity available in `documents/project-config.md`.
