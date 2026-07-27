-- Cleanup stale Ma Soi rooms and their cascaded gameplay data.

CREATE OR REPLACE FUNCTION public.cleanup_old_wolf_rooms(
  finished_older_than interval DEFAULT interval '7 days',
  completed_playing_older_than interval DEFAULT interval '7 days',
  empty_waiting_older_than interval DEFAULT interval '1 day',
  stale_waiting_older_than interval DEFAULT interval '14 days'
)
RETURNS TABLE (
  deleted_finished_rooms integer,
  deleted_completed_playing_rooms integer,
  deleted_empty_waiting_rooms integer,
  deleted_stale_waiting_rooms integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF finished_older_than < interval '1 hour'
    OR completed_playing_older_than < interval '1 hour'
    OR empty_waiting_older_than < interval '1 hour'
    OR stale_waiting_older_than < interval '1 day'
  THEN
    RAISE EXCEPTION 'Cleanup thresholds are too small.';
  END IF;

  WITH target_rooms AS (
    SELECT id
    FROM public.wolf_rooms
    WHERE status = 'finished'
      AND updated_at < now() - finished_older_than
  ),
  clear_current_game AS (
    UPDATE public.wolf_rooms room
    SET current_game_id = NULL
    FROM target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  ),
  deleted_rooms AS (
    DELETE FROM public.wolf_rooms room
    USING target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  )
  SELECT count(*)::integer
  INTO deleted_finished_rooms
  FROM deleted_rooms;

  WITH target_rooms AS (
    SELECT room.id
    FROM public.wolf_rooms room
    JOIN public.wolf_game_sessions game
      ON game.id = room.current_game_id
    WHERE room.status = 'playing'
      AND game.phase = 'result'
      AND game.updated_at < now() - completed_playing_older_than
  ),
  clear_current_game AS (
    UPDATE public.wolf_rooms room
    SET current_game_id = NULL
    FROM target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  ),
  deleted_rooms AS (
    DELETE FROM public.wolf_rooms room
    USING target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  )
  SELECT count(*)::integer
  INTO deleted_completed_playing_rooms
  FROM deleted_rooms;

  WITH target_rooms AS (
    SELECT room.id
    FROM public.wolf_rooms room
    WHERE room.status = 'waiting'
      AND room.current_game_id IS NULL
      AND room.updated_at < now() - empty_waiting_older_than
      AND NOT EXISTS (
        SELECT 1
        FROM public.wolf_room_players player
        WHERE player.room_id = room.id
      )
  ),
  deleted_rooms AS (
    DELETE FROM public.wolf_rooms room
    USING target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  )
  SELECT count(*)::integer
  INTO deleted_empty_waiting_rooms
  FROM deleted_rooms;

  WITH target_rooms AS (
    SELECT room.id
    FROM public.wolf_rooms room
    WHERE room.status = 'waiting'
      AND room.current_game_id IS NULL
      AND room.updated_at < now() - stale_waiting_older_than
  ),
  deleted_rooms AS (
    DELETE FROM public.wolf_rooms room
    USING target_rooms target
    WHERE room.id = target.id
    RETURNING room.id
  )
  SELECT count(*)::integer
  INTO deleted_stale_waiting_rooms
  FROM deleted_rooms;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_wolf_rooms(interval, interval, interval, interval)
IS 'Deletes old Ma Soi rooms. Related players, sessions, cards, actions, votes, and phase confirmations are removed through ON DELETE CASCADE.';

REVOKE ALL ON FUNCTION public.cleanup_old_wolf_rooms(interval, interval, interval, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_wolf_rooms(interval, interval, interval, interval) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'wolf-cleanup-old-rooms'
  ) THEN
    PERFORM cron.unschedule('wolf-cleanup-old-rooms');
  END IF;

  PERFORM cron.schedule(
    'wolf-cleanup-old-rooms',
    '17 3 * * *',
    'SELECT public.cleanup_old_wolf_rooms();'
  );
END $$;
