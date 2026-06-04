-- Phase 2 gameplay for Ma Sói Một Đêm.
create extension if not exists pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.wolf_game_phase AS ENUM ('night', 'discussion', 'voting', 'result');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.wolf_role AS ENUM (
    'werewolf',
    'villager',
    'seer',
    'robber',
    'troublemaker',
    'drunk',
    'insomniac'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.wolf_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.wolf_rooms(id) ON DELETE CASCADE,
  phase public.wolf_game_phase NOT NULL DEFAULT 'night',
  round_number integer NOT NULL DEFAULT 1,
  discussion_ends_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wolf_game_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.wolf_game_sessions(id) ON DELETE CASCADE,
  player_id uuid NULL REFERENCES public.wolf_room_players(id) ON DELETE CASCADE,
  center_index integer NULL,
  original_role public.wolf_role NOT NULL,
  "current_role" public.wolf_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wolf_game_cards_owner_check CHECK (
    (player_id IS NOT NULL AND center_index IS NULL)
    OR (player_id IS NULL AND center_index BETWEEN 0 AND 2)
  )
);

CREATE TABLE IF NOT EXISTS public.wolf_game_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.wolf_game_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.wolf_room_players(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_player_id uuid NULL REFERENCES public.wolf_room_players(id) ON DELETE SET NULL,
  target_player_id_2 uuid NULL REFERENCES public.wolf_room_players(id) ON DELETE SET NULL,
  target_center_index integer NULL,
  target_center_index_2 integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wolf_game_actions_center_index_check CHECK (
    target_center_index IS NULL OR target_center_index BETWEEN 0 AND 2
  ),
  CONSTRAINT wolf_game_actions_center_index_2_check CHECK (
    target_center_index_2 IS NULL OR target_center_index_2 BETWEEN 0 AND 2
  )
);

CREATE TABLE IF NOT EXISTS public.wolf_game_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.wolf_game_sessions(id) ON DELETE CASCADE,
  voter_player_id uuid NOT NULL REFERENCES public.wolf_room_players(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES public.wolf_room_players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wolf_rooms'
      AND column_name = 'current_game_id'
  ) THEN
    ALTER TABLE public.wolf_rooms
      ADD COLUMN current_game_id uuid NULL REFERENCES public.wolf_game_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wolf_game_sessions_room_id_idx ON public.wolf_game_sessions (room_id);
CREATE INDEX IF NOT EXISTS wolf_game_sessions_phase_idx ON public.wolf_game_sessions (phase);
CREATE INDEX IF NOT EXISTS wolf_game_cards_game_id_idx ON public.wolf_game_cards (game_id);
CREATE INDEX IF NOT EXISTS wolf_game_cards_player_id_idx ON public.wolf_game_cards (player_id);
CREATE INDEX IF NOT EXISTS wolf_game_actions_game_id_idx ON public.wolf_game_actions (game_id);
CREATE INDEX IF NOT EXISTS wolf_game_votes_game_id_idx ON public.wolf_game_votes (game_id);

CREATE UNIQUE INDEX IF NOT EXISTS wolf_game_cards_player_unique_idx
  ON public.wolf_game_cards (game_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wolf_game_cards_center_unique_idx
  ON public.wolf_game_cards (game_id, center_index)
  WHERE center_index IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wolf_game_actions_player_unique_idx
  ON public.wolf_game_actions (game_id, player_id);

CREATE UNIQUE INDEX IF NOT EXISTS wolf_game_votes_voter_unique_idx
  ON public.wolf_game_votes (game_id, voter_player_id);

DROP TRIGGER IF EXISTS wolf_game_sessions_set_updated_at ON public.wolf_game_sessions;
CREATE TRIGGER wolf_game_sessions_set_updated_at
  BEFORE UPDATE ON public.wolf_game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS wolf_game_actions_set_updated_at ON public.wolf_game_actions;
CREATE TRIGGER wolf_game_actions_set_updated_at
  BEFORE UPDATE ON public.wolf_game_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS wolf_game_votes_set_updated_at ON public.wolf_game_votes;
CREATE TRIGGER wolf_game_votes_set_updated_at
  BEFORE UPDATE ON public.wolf_game_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wolf_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolf_game_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolf_game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolf_game_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read wolf game sessions" ON public.wolf_game_sessions;
CREATE POLICY "Public read wolf game sessions"
  ON public.wolf_game_sessions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read wolf game cards" ON public.wolf_game_cards;
CREATE POLICY "Public read wolf game cards"
  ON public.wolf_game_cards
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read wolf game actions" ON public.wolf_game_actions;
CREATE POLICY "Public read wolf game actions"
  ON public.wolf_game_actions
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read wolf game votes" ON public.wolf_game_votes;
CREATE POLICY "Public read wolf game votes"
  ON public.wolf_game_votes
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.wolf_game_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.wolf_game_cards REPLICA IDENTITY FULL;
ALTER TABLE public.wolf_game_actions REPLICA IDENTITY FULL;
ALTER TABLE public.wolf_game_votes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_game_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_game_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_game_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_game_cards;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_game_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_game_actions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_game_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_game_votes;
  END IF;
END $$;
