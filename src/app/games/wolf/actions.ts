"use server";

import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WolfRoomStatus } from "@/lib/supabase/types";

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const PLAYER_SESSION_COOKIE = "boardverse_wolf_session";
const MAX_PLAYERS = 10;

export type WolfLobbyPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type WolfLobbyState = {
  room: {
    id: string;
    code: string;
    status: WolfRoomStatus;
    hostPlayerId: string | null;
  };
  players: WolfLobbyPlayer[];
  currentPlayerId: string | null;
};

export type WolfActionResult =
  | {
      ok: true;
      roomCode: string;
      playerId: string;
    }
  | {
      ok: false;
      error: string;
    };

function generateRoomCode() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toLowerCase();
}

function normalizePlayerName(playerName?: string) {
  const normalized = playerName?.trim().slice(0, 32);
  return normalized || `Người chơi ${Math.floor(1000 + Math.random() * 9000)}`;
}

function getDatabaseErrorMessage(errorCode?: string) {
  if (errorCode === "PGRST205" || errorCode === "42P01") {
    return "Database chưa được khởi tạo bảng phòng chơi. Cần chạy migration Supabase trước.";
  }

  return null;
}

async function getOrCreatePlayerSessionId() {
  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(PLAYER_SESSION_COOKIE)?.value;

  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = crypto.randomUUID();
  cookieStore.set(PLAYER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return sessionId;
}

async function getPlayerSessionId() {
  const cookieStore = await cookies();
  return cookieStore.get(PLAYER_SESSION_COOKIE)?.value ?? null;
}

export async function createWolfRoom(playerName?: string): Promise<WolfActionResult> {
  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("wolf_rooms")
      .insert({ code })
      .select("id, code, status, host_player_id, created_at, updated_at, game_key")
      .single();

    if (roomError) {
      if (roomError.code === "23505") {
        continue;
      }

      return {
        ok: false,
        error: getDatabaseErrorMessage(roomError.code) ?? "Không thể tạo phòng. Vui lòng thử lại.",
      };
    }

    const { data: hostPlayer, error: playerError } = await supabase
      .from("wolf_room_players")
      .insert({
        room_id: room.id,
        session_id: sessionId,
        name,
        is_host: true,
        is_ready: true,
      })
      .select("id")
      .single();

    if (playerError) {
      await supabase.from("wolf_rooms").delete().eq("id", room.id);
      return { ok: false, error: "Không thể thêm người chơi vào phòng." };
    }

    await supabase
      .from("wolf_rooms")
      .update({ host_player_id: hostPlayer.id })
      .eq("id", room.id);

    return { ok: true, roomCode: room.code, playerId: hostPlayer.id };
  }

  return { ok: false, error: "Không thể sinh mã phòng mới. Vui lòng thử lại." };
}

export async function joinWolfRoom(
  roomCode: string,
  playerName?: string
): Promise<WolfActionResult> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Mã phòng phải gồm đúng 4 chữ cái từ a đến z." };
  }

  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);

  const { data: room, error: roomError } = await supabase
    .from("wolf_rooms")
    .select("id, code, status, host_player_id")
    .eq("code", code)
    .single();

  if (roomError || !room) {
    return {
      ok: false,
      error:
        getDatabaseErrorMessage(roomError?.code) ?? "Không tìm thấy phòng với mã này.",
    };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng này đã bắt đầu hoặc đã kết thúc." };
  }

  const { data: existingPlayer } = await supabase
    .from("wolf_room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .is("left_at", null)
    .maybeSingle();

  if (existingPlayer) {
    await supabase
      .from("wolf_room_players")
      .update({ last_seen_at: new Date().toISOString(), name })
      .eq("id", existingPlayer.id);

    return { ok: true, roomCode: room.code, playerId: existingPlayer.id };
  }

  const { count: activePlayerCount } = await supabase
    .from("wolf_room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id)
    .is("left_at", null);

  if ((activePlayerCount ?? 0) >= MAX_PLAYERS) {
    return { ok: false, error: "Phòng đã đủ người." };
  }

  const { data: player, error: playerError } = await supabase
    .from("wolf_room_players")
    .insert({
      room_id: room.id,
      session_id: sessionId,
      name,
    })
    .select("id")
    .single();

  if (playerError || !player) {
    return { ok: false, error: "Không thể vào phòng. Vui lòng thử lại." };
  }

  return { ok: true, roomCode: room.code, playerId: player.id };
}

export async function leaveWolfRoom(roomCode: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code) || !sessionId) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("wolf_rooms")
    .select("id, host_player_id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return;
  }

  const { data: player } = await supabase
    .from("wolf_room_players")
    .select("id, is_host")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .is("left_at", null)
    .maybeSingle();

  if (!player) {
    return;
  }

  await supabase
    .from("wolf_room_players")
    .update({
      is_host: false,
      is_ready: false,
      left_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  if (!player.is_host) {
    return;
  }

  const { data: nextHost } = await supabase
    .from("wolf_room_players")
    .select("id")
    .eq("room_id", room.id)
    .is("left_at", null)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextHost) {
    await supabase
      .from("wolf_rooms")
      .update({ host_player_id: null, status: "finished" })
      .eq("id", room.id);
    return;
  }

  await supabase
    .from("wolf_room_players")
    .update({ is_host: true })
    .eq("id", nextHost.id);
  await supabase
    .from("wolf_rooms")
    .update({ host_player_id: nextHost.id })
    .eq("id", room.id);
}

export async function toggleWolfReady(roomCode: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code) || !sessionId) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("wolf_rooms")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return;
  }

  const { data: player } = await supabase
    .from("wolf_room_players")
    .select("id, is_ready")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .is("left_at", null)
    .maybeSingle();

  if (!player) {
    return;
  }

  await supabase
    .from("wolf_room_players")
    .update({
      is_ready: !player.is_ready,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", player.id);
}

export async function getWolfLobbyState(roomCode: string): Promise<WolfLobbyState | null> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const sessionId = await getPlayerSessionId();
  const { data: room } = await supabase
    .from("wolf_rooms")
    .select("id, code, status, host_player_id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return null;
  }

  const { data: players } = await supabase
    .from("wolf_room_players")
    .select("id, session_id, name, is_host, is_ready, joined_at")
    .eq("room_id", room.id)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
    },
    players: (players ?? []).map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.is_host,
      isReady: player.is_ready,
      joinedAt: player.joined_at,
    })),
    currentPlayerId:
      players?.find((player) => player.session_id === sessionId)?.id ?? null,
  };
}
