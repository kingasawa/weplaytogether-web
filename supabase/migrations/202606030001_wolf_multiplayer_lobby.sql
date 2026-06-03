-- Phase 1 multiplayer lobby for Ma Sói Một Đêm.
create extension if not exists pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.wolf_room_status AS ENUM ('waiting', 'playing', 'finished');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.wolf_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  game_key text NOT NULL DEFAULT 'wolf',
  status public.wolf_room_status NOT NULL DEFAULT 'waiting',
  host_player_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wolf_rooms_code_format CHECK (code ~ '^[a-z]{4}$')
);

CREATE TABLE IF NOT EXISTS public.wolf_room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.wolf_rooms(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  name text NOT NULL,
  is_host boolean NOT NULL DEFAULT false,
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NULL,
  CONSTRAINT wolf_room_players_name_length CHECK (char_length(trim(name)) BETWEEN 1 AND 32)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wolf_rooms_host_player_id_fkey'
  ) THEN
    ALTER TABLE public.wolf_rooms
      ADD CONSTRAINT wolf_rooms_host_player_id_fkey
      FOREIGN KEY (host_player_id) REFERENCES public.wolf_room_players(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wolf_rooms_code_idx ON public.wolf_rooms (code);
CREATE INDEX IF NOT EXISTS wolf_rooms_status_idx ON public.wolf_rooms (status);
CREATE INDEX IF NOT EXISTS wolf_room_players_room_id_idx ON public.wolf_room_players (room_id);
CREATE INDEX IF NOT EXISTS wolf_room_players_active_idx ON public.wolf_room_players (room_id, left_at);

CREATE UNIQUE INDEX IF NOT EXISTS wolf_room_players_active_session_idx
  ON public.wolf_room_players (room_id, session_id)
  WHERE left_at IS NULL;

DROP TRIGGER IF EXISTS wolf_rooms_set_updated_at ON public.wolf_rooms;
CREATE TRIGGER wolf_rooms_set_updated_at
  BEFORE UPDATE ON public.wolf_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wolf_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolf_room_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read wolf rooms" ON public.wolf_rooms;
CREATE POLICY "Public read wolf rooms"
  ON public.wolf_rooms
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read wolf room players" ON public.wolf_room_players;
CREATE POLICY "Public read wolf room players"
  ON public.wolf_room_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.wolf_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.wolf_room_players REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_room_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_room_players;
  END IF;
END $$;
