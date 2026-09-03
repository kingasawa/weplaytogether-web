"use server";

import { cookies } from "next/headers";
import {
  isMissingUserIdColumnError,
  isMissingTableError,
} from "@/lib/supabase/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { GameBugReportGameKey, Json, WolfGamePhase, WolfRoomStatus } from "@/lib/supabase/types";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";

type SubmitGameBugReportInput = {
  roomCode: string;
  gameId: string;
  reportText: string;
  clientContext?: {
    path?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
  };
};

export type SubmitGameBugReportResult =
  | { ok: true; reportId: string }
  | { ok: false; error: string };

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type DatabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined;

type RoomRow = {
  id: string;
  code: string;
  game_key: string;
  is_public?: boolean;
  status: WolfRoomStatus;
  host_player_id: string | null;
  current_game_id: string | null;
  created_at: string;
  updated_at: string;
};

type GameRow = {
  id: string;
  room_id: string;
  phase: WolfGamePhase;
  round_number: number;
  discussion_ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlayerRow = {
  id: string;
  room_id: string;
  session_id: string;
  name: string;
  user_id: string | null;
  is_host: boolean;
  joined_at: string;
};

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_TEXT_MIN_LENGTH = 5;
const REPORT_TEXT_MAX_LENGTH = 1000;
const NOT_READY_ERROR = "Hệ thống report chưa sẵn sàng. Hãy chạy migration Supabase trước.";

function normalizeRoomCode(roomCode: unknown) {
  return typeof roomCode === "string" ? roomCode.trim().toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReportGameKey(gameKey: unknown): gameKey is GameBugReportGameKey {
  return gameKey === "wolf" || gameKey === "classic_wolf" || gameKey === "avalon";
}

function isMissingNamedColumnError(error: DatabaseErrorLike, columnName: string) {
  if (!error) {
    return false;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  return (
    errorText.includes(columnName.toLowerCase()) &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      (errorText.includes("column") &&
        (errorText.includes("does not exist") || errorText.includes("could not find"))))
  );
}

function toErrorJson(error: DatabaseErrorLike): Json {
  return {
    error: error?.message ?? "Không thể tải dữ liệu.",
    code: error?.code ?? null,
  };
}

function limitString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeClientContext(value: unknown): Json {
  if (!isRecord(value)) {
    return {};
  }

  const context: Record<string, Json> = {};
  const path = limitString(value.path, 300);
  const userAgent = limitString(value.userAgent, 300);

  if (path) {
    context.path = path;
  }

  if (userAgent) {
    context.userAgent = userAgent;
  }

  if (isRecord(value.viewport)) {
    const width = value.viewport.width;
    const height = value.viewport.height;

    if (
      typeof width === "number" &&
      Number.isFinite(width) &&
      width > 0 &&
      width <= 10000 &&
      typeof height === "number" &&
      Number.isFinite(height) &&
      height > 0 &&
      height <= 10000
    ) {
      context.viewport = {
        width: Math.trunc(width),
        height: Math.trunc(height),
      };
    }
  }

  return context;
}

function parseInput(input: unknown) {
  if (!isRecord(input)) {
    return { ok: false as const, error: "Thông tin report không hợp lệ." };
  }

  const roomCode = normalizeRoomCode(input.roomCode);
  const gameId = typeof input.gameId === "string" ? input.gameId.trim() : "";
  const reportText = typeof input.reportText === "string" ? input.reportText.trim() : "";

  if (!ROOM_CODE_PATTERN.test(roomCode) || !UUID_PATTERN.test(gameId)) {
    return { ok: false as const, error: "Thông tin ván không hợp lệ." };
  }

  if (
    reportText.length < REPORT_TEXT_MIN_LENGTH ||
    reportText.length > REPORT_TEXT_MAX_LENGTH
  ) {
    return {
      ok: false as const,
      error: "Nội dung report cần từ 5 đến 1000 ký tự.",
    };
  }

  return {
    ok: true as const,
    data: {
      roomCode,
      gameId,
      reportText,
      clientContext: normalizeClientContext(input.clientContext),
    },
  };
}

async function getPlayerSessionId() {
  const cookieStore = await cookies();
  return cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value ?? null;
}

async function loadGame(supabase: SupabaseAdminClient, gameId: string) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("id, room_id, phase, round_number, discussion_ends_at, created_at, updated_at")
    .eq("id", gameId)
    .maybeSingle();

  return { game: (data ?? null) as GameRow | null, error };
}

async function loadRoom(supabase: SupabaseAdminClient, roomId: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, code, game_key, is_public, status, host_player_id, current_game_id, created_at, updated_at")
    .eq("id", roomId)
    .maybeSingle();

  return { room: (data ?? null) as RoomRow | null, error };
}

async function loadPlayers(supabase: SupabaseAdminClient, roomId: string) {
  const { data, error } = await supabase
    .from("room_players")
    .select("id, room_id, session_id, name, user_id, is_host, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (!error) {
    return { players: (data ?? []) as PlayerRow[], error: null };
  }

  if (!isMissingUserIdColumnError(error)) {
    return { players: [], error };
  }

  const fallback = await supabase
    .from("room_players")
    .select("id, room_id, session_id, name, is_host, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  return {
    players: ((fallback.data ?? []) as Array<Omit<PlayerRow, "user_id">>).map((player) => ({
      ...player,
      user_id: null,
    })),
    error: fallback.error,
  };
}

async function loadAvalonStateForPhase(supabase: SupabaseAdminClient, gameId: string) {
  const { data, error } = await supabase
    .from("avalon_game_states")
    .select("state, updated_at")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error || !data) {
    return { stateRow: null, phase: null, error };
  }

  const state = (data as { state?: unknown }).state;
  const phase = isRecord(state) && typeof state.phase === "string" ? state.phase : null;

  return { stateRow: data as Json, phase, error: null };
}

async function assertResultPhase(
  supabase: SupabaseAdminClient,
  gameKey: GameBugReportGameKey,
  game: GameRow
) {
  if (gameKey === "avalon") {
    const { stateRow, phase, error } = await loadAvalonStateForPhase(supabase, game.id);

    if (error) {
      return { ok: false as const, error: "Không thể đọc state Avalon." };
    }

    if (phase !== "result") {
      return { ok: false as const, error: "Chỉ có thể báo lỗi sau khi ván kết thúc." };
    }

    return { ok: true as const, gamePhase: phase, avalonStateRow: stateRow };
  }

  if (game.phase !== "result") {
    return { ok: false as const, error: "Chỉ có thể báo lỗi sau khi ván kết thúc." };
  }

  return { ok: true as const, gamePhase: game.phase, avalonStateRow: null };
}

async function loadRowsByGameId(
  supabase: SupabaseAdminClient,
  tableName: string,
  columns: string,
  gameId: string
): Promise<Json> {
  const { data, error } = await supabase
    .from(tableName)
    .select(columns)
    .eq("game_id", gameId);

  if (error) {
    return toErrorJson(error);
  }

  return (data ?? []) as Json;
}

async function loadWolfVotes(supabase: SupabaseAdminClient, gameId: string): Promise<Json> {
  const { data, error } = await supabase
    .from("game_votes")
    .select("id, game_id, voter_player_id, target_player_id, is_skip, created_at, updated_at")
    .eq("game_id", gameId);

  if (!error) {
    return (data ?? []) as Json;
  }

  if (!isMissingNamedColumnError(error, "is_skip")) {
    return toErrorJson(error);
  }

  const fallback = await supabase
    .from("game_votes")
    .select("id, game_id, voter_player_id, target_player_id, created_at, updated_at")
    .eq("game_id", gameId);

  if (fallback.error) {
    return toErrorJson(fallback.error);
  }

  return ((fallback.data ?? []) as Array<Record<string, Json>>).map((row) => ({
    ...row,
    is_skip: false,
  })) as Json;
}

async function loadWolfResultSnapshot(supabase: SupabaseAdminClient, gameId: string): Promise<Json> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("result_snapshot")
    .eq("id", gameId)
    .maybeSingle();

  if (!error) {
    return ((data as { result_snapshot?: Json | null } | null)?.result_snapshot ?? null) as Json;
  }

  return isMissingNamedColumnError(error, "result_snapshot") ? null : toErrorJson(error);
}

async function buildGameSpecificContext(
  supabase: SupabaseAdminClient,
  gameKey: GameBugReportGameKey,
  gameId: string,
  avalonStateRow: Json | null
): Promise<Record<string, Json>> {
  if (gameKey === "wolf") {
    const [resultSnapshot, cards, actions, votes, phaseConfirmations] = await Promise.all([
      loadWolfResultSnapshot(supabase, gameId),
      loadRowsByGameId(
        supabase,
        "game_cards",
        "id, game_id, player_id, center_index, original_role, current_role, created_at",
        gameId
      ),
      loadRowsByGameId(
        supabase,
        "game_actions",
        "id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3, created_at, updated_at",
        gameId
      ),
      loadWolfVotes(supabase, gameId),
      loadRowsByGameId(
        supabase,
        "game_phase_confirmations",
        "id, game_id, player_id, phase, created_at",
        gameId
      ),
    ]);

    return {
      wolf: {
        result_snapshot: resultSnapshot,
        game_cards: cards,
        game_actions: actions,
        game_votes: votes,
        game_phase_confirmations: phaseConfirmations,
      },
    };
  }

  if (gameKey === "classic_wolf") {
    return {
      classic_wolf: await loadRowsByGameId(
        supabase,
        "classic_wolf_game_states",
        "game_id, state, created_at, updated_at",
        gameId
      ),
    };
  }

  return {
    avalon: avalonStateRow ?? (await loadRowsByGameId(
      supabase,
      "avalon_game_states",
      "game_id, state, created_at, updated_at",
      gameId
    )),
  };
}

async function buildGameContext(
  supabase: SupabaseAdminClient,
  room: RoomRow,
  game: GameRow,
  players: PlayerRow[],
  reporter: PlayerRow,
  gamePhase: string,
  avalonStateRow: Json | null
): Promise<Json> {
  const gameKey = room.game_key as GameBugReportGameKey;
  const gameSpecificContext = await buildGameSpecificContext(supabase, gameKey, game.id, avalonStateRow);

  return {
    room: {
      id: room.id,
      code: room.code,
      game_key: room.game_key,
      is_public: room.is_public ?? null,
      status: room.status,
      host_player_id: room.host_player_id,
      current_game_id: room.current_game_id,
      created_at: room.created_at,
      updated_at: room.updated_at,
    },
    game: {
      id: game.id,
      phase: gamePhase,
      session_phase: game.phase,
      round_number: game.round_number,
      discussion_ends_at: game.discussion_ends_at,
      created_at: game.created_at,
      updated_at: game.updated_at,
    },
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      user_id: player.user_id,
      is_host: player.is_host,
      joined_at: player.joined_at,
    })),
    reporter: {
      player_id: reporter.id,
      user_id: reporter.user_id,
      name: reporter.name,
      is_host: reporter.is_host,
    },
    ...gameSpecificContext,
  };
}

export async function submitGameBugReport(input: SubmitGameBugReportInput): Promise<SubmitGameBugReportResult> {
  const parsed = parseInput(input);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const sessionId = await getPlayerSessionId();

  if (!sessionId) {
    return { ok: false, error: "Bạn không còn ở trong ván này." };
  }

  const supabase = createSupabaseAdminClient();
  const { game, error: gameError } = await loadGame(supabase, parsed.data.gameId);

  if (gameError) {
    return {
      ok: false,
      error: isMissingTableError(gameError, "game_sessions") ? NOT_READY_ERROR : "Không thể đọc ván chơi.",
    };
  }

  if (!game) {
    return { ok: false, error: "Không tìm thấy ván chơi." };
  }

  const { room, error: roomError } = await loadRoom(supabase, game.room_id);

  if (roomError) {
    return {
      ok: false,
      error: isMissingTableError(roomError, "rooms") ? NOT_READY_ERROR : "Không thể đọc phòng chơi.",
    };
  }

  if (!room || room.code !== parsed.data.roomCode || room.id !== game.room_id) {
    return { ok: false, error: "Thông tin phòng và ván không khớp." };
  }

  if (!isReportGameKey(room.game_key)) {
    return { ok: false, error: "Game này chưa hỗ trợ report." };
  }

  const { players, error: playersError } = await loadPlayers(supabase, room.id);

  if (playersError) {
    return {
      ok: false,
      error: isMissingTableError(playersError, "room_players")
        ? NOT_READY_ERROR
        : "Không thể đọc người chơi trong phòng.",
    };
  }

  const reporter = players.find((player) => player.session_id === sessionId) ?? null;

  if (!reporter) {
    return { ok: false, error: "Bạn không còn ở trong ván này." };
  }

  const phaseCheck = await assertResultPhase(supabase, room.game_key, game);

  if (!phaseCheck.ok) {
    return { ok: false, error: phaseCheck.error };
  }

  const gameContext = await buildGameContext(
    supabase,
    room,
    game,
    players,
    reporter,
    phaseCheck.gamePhase,
    phaseCheck.avalonStateRow
  );

  const { data, error: insertError } = await supabase
    .from("game_bug_reports")
    .insert({
      reporter_user_id: reporter.user_id,
      reporter_player_id: reporter.id,
      reporter_name: reporter.name,
      game_key: room.game_key,
      game_id: game.id,
      room_id: room.id,
      room_code: room.code,
      game_phase: phaseCheck.gamePhase,
      report_text: parsed.data.reportText,
      game_context: gameContext,
      client_context: parsed.data.clientContext,
    })
    .select("id")
    .single();

  if (insertError) {
    return {
      ok: false,
      error: isMissingTableError(insertError, "game_bug_reports")
        ? NOT_READY_ERROR
        : "Không thể gửi report. Hãy thử lại.",
    };
  }

  return { ok: true, reportId: (data as { id: string }).id };
}
