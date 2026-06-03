<!-- Last updated: 2026-06-03 -->

# Migrations

## 202606030001_wolf_multiplayer_lobby.sql

Status: created locally, not applied remotely.

Path:

- `supabase/migrations/202606030001_wolf_multiplayer_lobby.sql`

Purpose:

- Add Phase 1 Ma Sói realtime multiplayer lobby schema.
- Create room and player tables.
- Enable RLS with public read-only policies for lobby sync.
- Add tables to `supabase_realtime` publication.

Remote execution attempts on 2026-06-03:

- Supabase Management API `POST /v1/projects/{ref}/database/query`: blocked by insufficient token privileges.
- Direct Postgres pooler connection: blocked by tenant/user lookup failure with available project ref/password.
- Supabase REST verification: `public.wolf_rooms` not found in schema cache.

Required next action:

- Apply the SQL manually in Supabase SQL Editor, or provide a Management API token / database connection string with permission to run migrations.
