-- Allow Copy Cat copying Seer to inspect two additional center cards.
ALTER TABLE public.wolf_game_actions
  ADD COLUMN IF NOT EXISTS target_center_index_3 integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wolf_game_actions_center_index_3_check'
      AND conrelid = 'public.wolf_game_actions'::regclass
  ) THEN
    ALTER TABLE public.wolf_game_actions
      ADD CONSTRAINT wolf_game_actions_center_index_3_check
      CHECK (target_center_index_3 IS NULL OR target_center_index_3 BETWEEN 0 AND 2);
  END IF;
END $$;
