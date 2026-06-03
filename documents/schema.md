<!-- Last updated: 2026-06-03 -->

# Database Schema

## Verified Scope

This document currently tracks the Ma Sói multiplayer lobby schema status.

Verification on 2026-06-03 via Supabase REST returned `PGRST205` for `public.wolf_rooms`, so the Ma Sói lobby tables are not currently present in the remote database schema cache.

## Current Remote State

No verified Ma Sói multiplayer tables exist on the remote database yet.

## Pending Local Migration

Local migration file created but not applied remotely:

- `supabase/migrations/202606030001_wolf_multiplayer_lobby.sql`

The migration is intended to create:

- `public.wolf_room_status` enum: `waiting`, `playing`, `finished`
- `public.wolf_rooms`
- `public.wolf_room_players`
- `public.set_updated_at()` trigger function
- indexes for room code/status/player lookup
- realtime publication entries for `wolf_rooms` and `wolf_room_players`

## Remote Apply Blocker

Remote migration execution is blocked because the configured Supabase Management API token does not have access to `POST /v1/projects/{ref}/database/query`, and the available pooler connection details did not resolve to the configured tenant.
