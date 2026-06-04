-- Phase confirmations for automatic Ma Soi phase progression.

ALTER TYPE public.wolf_game_phase ADD VALUE IF NOT EXISTS 'card_reveal';
ALTER TYPE public.wolf_game_phase ADD VALUE IF NOT EXISTS 'night_review';

CREATE TABLE IF NOT EXISTS public.wolf_game_phase_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.wolf_game_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.wolf_room_players(id) ON DELETE CASCADE,
  phase public.wolf_game_phase NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wolf_game_phase_confirmations_game_id_idx
  ON public.wolf_game_phase_confirmations (game_id);

CREATE UNIQUE INDEX IF NOT EXISTS wolf_game_phase_confirmations_unique_idx
  ON public.wolf_game_phase_confirmations (game_id, player_id, phase);

ALTER TABLE public.wolf_game_phase_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read wolf game phase confirmations" ON public.wolf_game_phase_confirmations;
CREATE POLICY "Public read wolf game phase confirmations"
  ON public.wolf_game_phase_confirmations
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE public.wolf_game_phase_confirmations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'wolf_game_phase_confirmations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolf_game_phase_confirmations;
  END IF;
END $$;
