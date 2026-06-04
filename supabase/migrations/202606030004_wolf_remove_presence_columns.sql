-- Remove heartbeat/presence columns from Ma Soi room players.

DELETE FROM public.wolf_room_players
WHERE left_at IS NOT NULL;

DROP INDEX IF EXISTS public.wolf_room_players_active_session_idx;
DROP INDEX IF EXISTS public.wolf_room_players_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS wolf_room_players_room_session_idx
  ON public.wolf_room_players (room_id, session_id);

ALTER TABLE public.wolf_room_players
  DROP COLUMN IF EXISTS left_at,
  DROP COLUMN IF EXISTS last_seen_at;
