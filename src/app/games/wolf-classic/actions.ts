"use server";

import { cookies } from "next/headers";
import {
  getUploadedPlayerAvatarUrl,
  normalizePlayerAvatarKey,
  normalizePlayerAvatarObjectKey,
  normalizePlayerAvatarObjectKeyForSession,
} from "@/lib/player-avatars";
import { safeBroadcastWolfPlayUpdate, safeBroadcastWolfRoomUpdate } from "@/lib/pusher/server";
import {
  isMissingAvatarKeyColumnError,
  isMissingAvatarObjectKeyColumnError,
} from "@/lib/supabase/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WolfGamePhase, WolfRoomStatus } from "@/lib/supabase/types";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";
import {
  CLASSIC_WOLF_ROLE_LABELS,
  type ClassicWolfRole,
  type ClassicWolfTeam,
} from "@/lib/classic-wolf-game";

const CLASSIC_WOLF_GAME_KEY = "classic_wolf";
const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 4;
const DISCUSSION_DURATION_MS = 5 * 60 * 1000;
const VOTING_DURATION_MS = 5 * 60 * 1000;
const NIGHT_AUTO_PASS_MIN_MS = 10_000;
const NIGHT_AUTO_PASS_MAX_MS = 15_000;

const ROLE_DECK_ORDER: ClassicWolfRole[] = [
  "werewolf",
  "werewolf",
  "seer",
  "witch",
  "guard",
  "hunter",
  "villager",
  "villager",
  "villager",
  "villager",
];

const ROLE_SELECTION_LIMITS: Record<ClassicWolfRole, number> = {
  villager: 6,
  werewolf: 3,
  seer: 1,
  witch: 1,
  guard: 1,
  hunter: 1,
};

type RoomRow = {
  id: string;
  code: string;
  game_key: string;
  is_public?: boolean;
  status: WolfRoomStatus;
  host_player_id: string | null;
  current_game_id: string | null;
};

type PlayerRow = {
  id: string;
  room_id: string;
  session_id: string;
  name: string;
  avatar_key?: string | null;
  avatar_object_key?: string | null;
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
};

type PublicRoomRow = {
  id: string;
  code: string;
  host_player_id: string | null;
  updated_at: string;
};

type PublicRoomPlayerRow = {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  joined_at: string;
};

type DatabaseMutationError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type ClassicWolfNightAction = {
  actionType: ClassicWolfRole;
  targetPlayerId: string | null;
  useHeal?: boolean;
};

type ClassicWolfNightSelection = {
  actionType: ClassicWolfRole;
  targetPlayerId: string | null;
};

type ClassicWolfDeathEvent = {
  roundNumber: number;
  phase: "night" | "day";
  playerIds: string[];
  reason: string;
};

type ClassicWolfNightRole = "guard" | "werewolf" | "seer" | "witch" | "hunter" | "villager";

const CLASSIC_WOLF_NIGHT_ROLE_ORDER: ClassicWolfNightRole[] = ["guard", "werewolf", "seer", "witch", "hunter"];
const CLASSIC_WOLF_VILLAGER_DECOY_ANCHOR_ROLES: ClassicWolfNightRole[] = ["guard", "seer", "witch"];

type ClassicWolfNightAutoPassTurn = {
  endsAt: string;
  passed: boolean;
};

type ClassicWolfActiveNightTurn = {
  role: ClassicWolfNightRole;
  playerIds: string[];
  playerNames: string[];
  isAutoPass: boolean;
  autoPassEndsAt: string | null;
};

type ClassicWolfState = {
  roleByPlayerId: Record<string, ClassicWolfRole>;
  playerNameByPlayerId: Record<string, string>;
  alivePlayerIds: string[];
  nightNumber: number;
  dayNumber: number;
  nightActionsByNight: Record<string, Record<string, ClassicWolfNightAction>>;
  nightSelectionsByNight: Record<string, Record<string, ClassicWolfNightSelection>>;
  resolvedWolfAttackTargetByNight: Record<string, string | null>;
  nightAutoPassByNight: Record<string, Partial<Record<ClassicWolfNightRole, ClassicWolfNightAutoPassTurn>>>;
  votesByDay: Record<string, Record<string, string | null>>;
  voteSelectionsByDay: Record<string, Record<string, string | null>>;
  phaseConfirmations: Record<string, string[]>;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  lastSeerRevealByPlayerId: Record<string, {
    nightNumber: number;
    targetPlayerId: string;
    targetRole: ClassicWolfRole;
    isWerewolf: boolean;
  }>;
  deathEvents: ClassicWolfDeathEvent[];
  pendingDeathEvent: ClassicWolfDeathEvent | null;
  winnerTeam: ClassicWolfTeam | null;
  winnerText: string | null;
};

type ClassicWolfSeerReveal = {
  nightNumber: number;
  targetPlayerId: string;
  isWerewolf: boolean;
};

export type ClassicWolfWolfPackMember = {
  id: string;
  name: string;
  avatarKey: string;
  avatarUrl: string | null;
  isAlive: boolean;
  isCurrentPlayer: boolean;
  hasSubmittedAction: boolean;
  selectedTargetPlayerId: string | null;
  selectedTargetName: string | null;
};

type ClassicWolfNightHistoryIcon = "shield";

type ClassicWolfNightHistoryLine = {
  role: ClassicWolfNightRole | "vote" | "result";
  text: string;
  icons: ClassicWolfNightHistoryIcon[];
};

type ClassicWolfNightHistoryItem = {
  nightNumber: number;
  guardSummary: string;
  wolfSummary: string;
  seerSummary: string;
  witchSummary: string;
  actionDescriptions: ClassicWolfNightHistoryLine[];
  deathPlayerIds: string[];
  deathSummary: string;
};

export type ClassicWolfLobbyPlayer = {
  id: string;
  name: string;
  avatarKey: string;
  avatarObjectKey: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type ClassicWolfLobbyState = {
  room: {
    id: string;
    code: string;
    status: WolfRoomStatus;
    hostPlayerId: string | null;
    currentGameId: string | null;
  };
  players: ClassicWolfLobbyPlayer[];
  currentPlayerId: string | null;
};

export type ClassicWolfPlayPlayer = ClassicWolfLobbyPlayer & {
  role: ClassicWolfRole | null;
  isAlive: boolean;
  hasVoted: boolean;
  voteTargetPlayerId: string | null;
  hasVoteSelection: boolean;
  voteSelectionTargetPlayerId: string | null;
  isPhaseReady: boolean;
};

export type ClassicWolfPlayState = {
  room: ClassicWolfLobbyState["room"];
  game: {
    id: string;
    phase: WolfGamePhase;
    roundNumber: number;
    discussionEndsAt: string | null;
    votingEndsAt: string | null;
  };
  players: ClassicWolfPlayPlayer[];
  currentPlayerId: string | null;
  isCurrentPlayerHost: boolean;
  myRole: ClassicWolfRole | null;
  activeNightTurn: ClassicWolfActiveNightTurn | null;
  myNightAction: ClassicWolfNightAction | null;
  seerReveal: ClassicWolfSeerReveal | null;
  nightReminder: {
    title: string;
    lines: string[];
  } | null;
  wolfPack: ClassicWolfWolfPackMember[];
  witchVictimPlayerId: string | null;
  previousGuardTargetPlayerId: string | null;
  pendingDeathEvent: ClassicWolfDeathEvent | null;
  deathEvents: ClassicWolfDeathEvent[];
  phaseReadyPlayerIds: string[];
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  allVotesSubmitted: boolean;
  result: {
    winnerTeam: ClassicWolfTeam;
    winnerText: string;
  } | null;
  roleDeck: ClassicWolfRole[];
  nightHistory: ClassicWolfNightHistoryItem[];
};

export type ClassicWolfActionResult =
  | {
      ok: true;
      roomCode: string;
      playerId: string;
      playerName: string;
      playerAvatarKey: string;
      playerAvatarObjectKey: string | null;
      playerAvatarUrl: string | null;
    }
  | {
      ok: false;
      error: string;
    };

export type ClassicWolfPublicRoomSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  updatedAt: string;
};

export type ClassicWolfPublicRoomsResult =
  | {
      ok: true;
      rooms: ClassicWolfPublicRoomSummary[];
    }
  | {
      ok: false;
      error: string;
    };

export type ClassicWolfStartGameResult =
  | {
      ok: true;
      roomCode: string;
      gameId: string;
    }
  | {
      ok: false;
      error: string;
    };

export type ClassicWolfMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ClassicWolfNightActionInput = {
  actionType: ClassicWolfRole;
  targetPlayerId?: string | null;
  useHeal?: boolean;
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
  if (errorCode === "PGRST205") {
    return "Database chưa được khởi tạo bảng phòng chơi. Cần chạy migration Supabase trước.";
  }

  if (errorCode === "42P01") {
    return "Database chưa có bảng Ma Sói nhiều đêm. Cần chạy migration classic_wolf_state.";
  }

  return null;
}

function getRoomVisibilityErrorMessage(error?: DatabaseMutationError | null) {
  if (!error) {
    return null;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  if (errorText.includes("is_public")) {
    return "Database chưa có cột public/private cho phòng chơi. Cần chạy migration wolf_room_visibility trước.";
  }

  return null;
}

function getAvatarObjectKeyErrorMessage(error?: DatabaseMutationError | null) {
  if (isMissingAvatarObjectKeyColumnError(error)) {
    return "Database chua co cot avatar upload R2. Can chay migration 202608180001_wolf_player_avatar_objects truoc.";
  }

  return null;
}

function getRequestedAvatarObjectKey(avatarObjectKey: string | null | undefined, sessionId: string) {
  const normalizedAvatarObjectKey = normalizePlayerAvatarObjectKeyForSession(avatarObjectKey, sessionId);

  if (avatarObjectKey && !normalizedAvatarObjectKey) {
    return {
      ok: false as const,
      error: "Avatar upload khong hop le. Hay tai lai anh avatar.",
    };
  }

  return {
    ok: true as const,
    avatarObjectKey: normalizedAvatarObjectKey,
  };
}

function shuffleRoles(roles: ClassicWolfRole[]) {
  const shuffled = [...roles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    const swapIndex = randomByte[0] % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function buildDefaultRoleDeck(roleCount: number) {
  return ROLE_DECK_ORDER.slice(0, roleCount);
}

function validateSelectedRoleDeck(selectedRoles: ClassicWolfRole[] | undefined, playerCount: number) {
  const roles = selectedRoles ?? buildDefaultRoleDeck(playerCount);
  const validRoles = new Set(ROLE_DECK_ORDER);

  if (roles.length !== playerCount) {
    return { ok: false as const, error: `Cần chọn đúng ${playerCount} role cho ${playerCount} người chơi.` };
  }

  if (roles.some((role) => !validRoles.has(role))) {
    return { ok: false as const, error: "Danh sách role được chọn không hợp lệ." };
  }

  if (!roles.includes("werewolf")) {
    return { ok: false as const, error: "Ván nhiều đêm cần ít nhất một Ma Sói." };
  }

  for (const role of validRoles) {
    const selectedCount = roles.filter((selectedRole) => selectedRole === role).length;
    const roleLimit = ROLE_SELECTION_LIMITS[role];

    if (selectedCount > roleLimit) {
      return {
        ok: false as const,
        error: `${CLASSIC_WOLF_ROLE_LABELS[role]} chỉ được chọn tối đa ${roleLimit} role.`,
      };
    }
  }

  return { ok: true as const, roles };
}

async function getOrCreatePlayerSessionId() {
  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value;

  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = crypto.randomUUID();
  cookieStore.set(WOLF_PLAYER_SESSION_COOKIE, sessionId, {
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
  return cookieStore.get(WOLF_PLAYER_SESSION_COOKIE)?.value ?? null;
}

async function getRoomByCode(roomCode: string) {
  const supabase = createSupabaseAdminClient();
  const { data: room, error } = await supabase
    .from("wolf_rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", normalizeRoomCode(roomCode))
    .eq("game_key", CLASSIC_WOLF_GAME_KEY)
    .maybeSingle();

  return { supabase, room: room as RoomRow | null, error };
}

async function getActivePlayers(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  room: RoomRow
) {
  const { data: players, error } = await supabase
    .from("wolf_room_players")
    .select("id, room_id, session_id, name, avatar_key, avatar_object_key, is_host, is_ready, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  if (isMissingAvatarObjectKeyColumnError(error)) {
    const { data: playersWithoutAvatarObjectKey, error: avatarKeyError } = await supabase
      .from("wolf_room_players")
      .select("id, room_id, session_id, name, avatar_key, is_host, is_ready, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true });

    if (!isMissingAvatarKeyColumnError(avatarKeyError)) {
      return ((playersWithoutAvatarObjectKey ?? []) as PlayerRow[]).map((player) => ({
        ...player,
        avatar_object_key: undefined,
      }));
    }

    const { data: playersWithoutAvatar } = await supabase
      .from("wolf_room_players")
      .select("id, room_id, session_id, name, is_host, is_ready, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true });

    return ((playersWithoutAvatar ?? []) as PlayerRow[]).map((player) => ({
      ...player,
      avatar_key: undefined,
      avatar_object_key: undefined,
    }));
  }

  if (isMissingAvatarKeyColumnError(error)) {
    const { data: playersWithoutAvatar } = await supabase
      .from("wolf_room_players")
      .select("id, room_id, session_id, name, is_host, is_ready, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true });

    return ((playersWithoutAvatar ?? []) as PlayerRow[]).map((player) => ({
      ...player,
      avatar_key: undefined,
      avatar_object_key: undefined,
    }));
  }

  return (players ?? []) as PlayerRow[];
}

async function insertWolfRoomPlayer(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  values: {
    room_id: string;
    session_id: string;
    name: string;
    avatar_key: string;
    avatar_object_key?: string | null;
    is_host?: boolean;
    is_ready?: boolean;
  }
) {
  const insertValues = {
    room_id: values.room_id,
    session_id: values.session_id,
    name: values.name,
    avatar_key: values.avatar_key,
    is_host: values.is_host,
    is_ready: values.is_ready,
    ...(values.avatar_object_key ? { avatar_object_key: values.avatar_object_key } : {}),
  };
  const { data, error } = await supabase
    .from("wolf_room_players")
    .insert(insertValues)
    .select("id")
    .single();

  if (values.avatar_object_key && isMissingAvatarObjectKeyColumnError(error)) {
    return { data, error };
  }

  if (!isMissingAvatarKeyColumnError(error)) {
    return { data, error };
  }

  const fallbackValues = {
    room_id: values.room_id,
    session_id: values.session_id,
    name: values.name,
    is_host: values.is_host,
    is_ready: values.is_ready,
  };

  return supabase.from("wolf_room_players").insert(fallbackValues).select("id").single();
}

async function updateWolfRoomPlayerIdentity(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string,
  name: string,
  avatarKey: string,
  avatarObjectKey: string | null
) {
  const updateValues = {
    name,
    avatar_key: avatarKey,
    avatar_object_key: avatarObjectKey,
  };
  const { error } = await supabase
    .from("wolf_room_players")
    .update(updateValues)
    .eq("id", playerId);

  if (avatarObjectKey && isMissingAvatarObjectKeyColumnError(error)) {
    return error;
  }

  if (isMissingAvatarObjectKeyColumnError(error)) {
    const { error: fallbackError } = await supabase
      .from("wolf_room_players")
      .update({ name, avatar_key: avatarKey })
      .eq("id", playerId);

    return fallbackError;
  }

  if (!isMissingAvatarKeyColumnError(error)) {
    return error;
  }

  const { error: fallbackError } = await supabase
    .from("wolf_room_players")
    .update({ name })
    .eq("id", playerId);

  return fallbackError;
}

function mapLobbyPlayer(player: PlayerRow): ClassicWolfLobbyPlayer {
  const avatarObjectKey = normalizePlayerAvatarObjectKey(player.avatar_object_key);

  return {
    id: player.id,
    name: player.name,
    avatarKey: normalizePlayerAvatarKey(player.avatar_key),
    avatarObjectKey,
    avatarUrl: getUploadedPlayerAvatarUrl(avatarObjectKey),
    isHost: player.is_host,
    isReady: player.is_ready,
    joinedAt: player.joined_at,
  };
}

function mapPublicRoomSummaries(
  rooms: PublicRoomRow[],
  players: PublicRoomPlayerRow[]
): ClassicWolfPublicRoomSummary[] {
  const playersByRoomId = new Map<string, PublicRoomPlayerRow[]>();

  for (const player of players) {
    const roomPlayers = playersByRoomId.get(player.room_id) ?? [];
    roomPlayers.push(player);
    playersByRoomId.set(player.room_id, roomPlayers);
  }

  return rooms
    .map((room) => {
      const roomPlayers = playersByRoomId.get(room.id) ?? [];
      const hostPlayer =
        roomPlayers.find((player) => player.id === room.host_player_id) ??
        roomPlayers.find((player) => player.is_host) ??
        roomPlayers[0] ??
        null;

      return {
        code: room.code,
        hostName: hostPlayer?.name ?? "Không rõ",
        playerCount: roomPlayers.length,
        maxPlayers: MAX_PLAYERS,
        updatedAt: room.updated_at,
      };
    })
    .filter((room) => room.playerCount > 0);
}

async function listPublicRoomsByGameKey(gameKey: string): Promise<ClassicWolfPublicRoomsResult> {
  const supabase = createSupabaseAdminClient();
  const { data: rooms, error: roomError } = await supabase
    .from("wolf_rooms")
    .select("id, code, host_player_id, updated_at")
    .eq("game_key", gameKey)
    .eq("status", "waiting")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (roomError) {
    return {
      ok: false,
      error:
        getRoomVisibilityErrorMessage(roomError) ??
        getDatabaseErrorMessage(roomError.code) ??
        "Không thể tải danh sách phòng public.",
    };
  }

  const publicRooms = (rooms ?? []) as PublicRoomRow[];

  if (publicRooms.length === 0) {
    return { ok: true, rooms: [] };
  }

  const { data: players, error: playerError } = await supabase
    .from("wolf_room_players")
    .select("id, room_id, name, is_host, joined_at")
    .in(
      "room_id",
      publicRooms.map((room) => room.id)
    )
    .order("joined_at", { ascending: true });

  if (playerError) {
    return {
      ok: false,
      error:
        getDatabaseErrorMessage(playerError.code) ??
        "Không thể tải người chơi trong các phòng public.",
    };
  }

  return {
    ok: true,
    rooms: mapPublicRoomSummaries(publicRooms, (players ?? []) as PublicRoomPlayerRow[]),
  };
}

function getCurrentPlayer(players: PlayerRow[], sessionId: string | null) {
  return players.find((player) => player.session_id === sessionId) ?? null;
}

function isHost(player: PlayerRow | null, room: RoomRow) {
  return Boolean(player && (player.is_host || player.id === room.host_player_id));
}

function buildWolfPackMembers(
  players: PlayerRow[],
  state: ClassicWolfState,
  currentPlayer: PlayerRow | null,
  phase: WolfGamePhase
): ClassicWolfWolfPackMember[] {
  if (!currentPlayer || state.roleByPlayerId[currentPlayer.id] !== "werewolf") {
    return [];
  }

  const shouldRevealCurrentNightTargets = phase === "night";
  const nightKey = String(state.nightNumber);
  const actions = shouldRevealCurrentNightTargets ? state.nightActionsByNight[nightKey] ?? {} : {};
  const selections = shouldRevealCurrentNightTargets ? state.nightSelectionsByNight[nightKey] ?? {} : {};
  const alivePlayerIds = new Set(state.alivePlayerIds);

  return players
    .filter((player) => state.roleByPlayerId[player.id] === "werewolf")
    .map((player) => {
      const submittedAction = actions[player.id]?.actionType === "werewolf" ? actions[player.id] : null;
      const activeSelection = selections[player.id]?.actionType === "werewolf" ? selections[player.id] : null;
      const selectedTargetPlayerId = submittedAction?.targetPlayerId ?? activeSelection?.targetPlayerId ?? null;

      return {
        id: player.id,
        name: player.name,
        avatarKey: normalizePlayerAvatarKey(player.avatar_key),
        avatarUrl: getUploadedPlayerAvatarUrl(player.avatar_object_key),
        isAlive: alivePlayerIds.has(player.id),
        isCurrentPlayer: player.id === currentPlayer.id,
        hasSubmittedAction: Boolean(submittedAction),
        selectedTargetPlayerId,
        selectedTargetName: selectedTargetPlayerId ? getPlayerName(players, selectedTargetPlayerId, state) : null,
      };
    });
}

function getPlayerName(players: PlayerRow[], playerId: string | null, state?: Pick<ClassicWolfState, "playerNameByPlayerId">) {
  if (!playerId) {
    return "người chơi đã rời";
  }

  return players.find((player) => player.id === playerId)?.name ?? state?.playerNameByPlayerId[playerId] ?? "người chơi đã rời";
}

function buildInitialClassicState(players: PlayerRow[], roles: ClassicWolfRole[]): ClassicWolfState {
  return {
    roleByPlayerId: Object.fromEntries(players.map((player, index) => [player.id, roles[index]])),
    playerNameByPlayerId: Object.fromEntries(players.map((player) => [player.id, player.name])),
    alivePlayerIds: players.map((player) => player.id),
    nightNumber: 1,
    dayNumber: 1,
    nightActionsByNight: {},
    nightSelectionsByNight: {},
    resolvedWolfAttackTargetByNight: {},
    nightAutoPassByNight: {},
    votesByDay: {},
    voteSelectionsByDay: {},
    phaseConfirmations: {},
    witchHealUsed: false,
    witchPoisonUsed: false,
    lastSeerRevealByPlayerId: {},
    deathEvents: [],
    pendingDeathEvent: null,
    winnerTeam: null,
    winnerText: null,
  };
}

function parseClassicState(rawState: unknown, players: PlayerRow[]): ClassicWolfState {
  const fallbackRoles = buildDefaultRoleDeck(players.length);
  const fallback = buildInitialClassicState(players, fallbackRoles);

  if (!rawState || typeof rawState !== "object") {
    return fallback;
  }

  const state = rawState as Partial<ClassicWolfState>;
  const roleByPlayerId = {
    ...fallback.roleByPlayerId,
    ...(state.roleByPlayerId ?? {}),
  };
  const playerNameByPlayerId = {
    ...fallback.playerNameByPlayerId,
    ...(state.playerNameByPlayerId ?? {}),
    ...Object.fromEntries(players.map((player) => [player.id, player.name])),
  };
  const knownPlayerIds = new Set([...Object.keys(roleByPlayerId), ...Object.keys(playerNameByPlayerId)]);

  return {
    ...fallback,
    ...state,
    roleByPlayerId,
    playerNameByPlayerId,
    alivePlayerIds: (state.alivePlayerIds ?? fallback.alivePlayerIds).filter((playerId) =>
      knownPlayerIds.has(playerId)
    ),
    nightActionsByNight: state.nightActionsByNight ?? {},
    nightSelectionsByNight: state.nightSelectionsByNight ?? {},
    resolvedWolfAttackTargetByNight: state.resolvedWolfAttackTargetByNight ?? {},
    nightAutoPassByNight: state.nightAutoPassByNight ?? {},
    votesByDay: state.votesByDay ?? {},
    voteSelectionsByDay: state.voteSelectionsByDay ?? {},
    phaseConfirmations: state.phaseConfirmations ?? {},
    lastSeerRevealByPlayerId: state.lastSeerRevealByPlayerId ?? {},
    deathEvents: state.deathEvents ?? [],
    pendingDeathEvent: state.pendingDeathEvent ?? null,
    winnerTeam: state.winnerTeam ?? null,
    winnerText: state.winnerText ?? null,
  };
}

function getAlivePlayers(players: PlayerRow[], state: ClassicWolfState) {
  const alivePlayerIds = new Set(state.alivePlayerIds);
  return players.filter((player) => alivePlayerIds.has(player.id));
}

function getAlivePlayersByRole(players: PlayerRow[], state: ClassicWolfState, role: ClassicWolfRole) {
  return getAlivePlayers(players, state).filter((player) => state.roleByPlayerId[player.id] === role);
}

function getPhaseConfirmationKey(phase: WolfGamePhase, state: ClassicWolfState) {
  if (phase === "night_review") {
    const event = state.pendingDeathEvent;
    return event ? `${phase}:${event.phase}:${event.roundNumber}` : `${phase}:none`;
  }

  if (phase === "discussion" || phase === "voting") {
    return `${phase}:${state.dayNumber}`;
  }

  if (phase === "night") {
    return `${phase}:${state.nightNumber}`;
  }

  return phase;
}

function getPhaseReadyPlayerIds(phase: WolfGamePhase, state: ClassicWolfState) {
  return state.phaseConfirmations[getPhaseConfirmationKey(phase, state)] ?? [];
}

function hasPlayerConfirmedNightResult(playerId: string, state: ClassicWolfState) {
  return getPhaseReadyPlayerIds("night", state).includes(playerId);
}

function setPlayerPhaseReady(playerId: string, phase: WolfGamePhase, state: ClassicWolfState) {
  const key = getPhaseConfirmationKey(phase, state);
  const readyPlayerIds = new Set(state.phaseConfirmations[key] ?? []);
  readyPlayerIds.add(playerId);

  return {
    ...state,
    phaseConfirmations: {
      ...state.phaseConfirmations,
      [key]: Array.from(readyPlayerIds),
    },
  };
}

function getVoteCounts(players: PlayerRow[], state: ClassicWolfState) {
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const voteMap = new Map<string, number>();

  for (const playerId of state.alivePlayerIds) {
    voteMap.set(playerId, 0);
  }

  for (const targetPlayerId of Object.values(state.votesByDay[String(state.dayNumber)] ?? {})) {
    if (targetPlayerId && alivePlayerIds.has(targetPlayerId)) {
      voteMap.set(targetPlayerId, (voteMap.get(targetPlayerId) ?? 0) + 1);
    }
  }

  return Array.from(voteMap.entries()).map(([playerId, votes]) => ({
    playerId,
    playerName: getPlayerName(players, playerId),
    votes,
  }));
}

function getSkippedVoteCount(players: PlayerRow[], state: ClassicWolfState) {
  const dayVotes = state.votesByDay[String(state.dayNumber)] ?? {};

  return getAlivePlayers(players, state).filter(
    (player) => Object.prototype.hasOwnProperty.call(dayVotes, player.id) && dayVotes[player.id] === null
  ).length;
}

function getTopVotedPlayerIds(voteCounts: Array<{ playerId: string; votes: number }>, maxVotes: number) {
  if (maxVotes <= 0) {
    return [];
  }

  return voteCounts
    .filter((voteCount) => voteCount.votes === maxVotes)
    .map((voteCount) => voteCount.playerId);
}

function completeMissingVotesAsSkip(players: PlayerRow[], state: ClassicWolfState) {
  const dayKey = String(state.dayNumber);
  const votes = state.votesByDay[dayKey] ?? {};
  const nextVotes = { ...votes };

  for (const player of getAlivePlayers(players, state)) {
    if (!Object.prototype.hasOwnProperty.call(nextVotes, player.id)) {
      nextVotes[player.id] = null;
    }
  }

  return {
    ...state,
    votesByDay: {
      ...state.votesByDay,
      [dayKey]: nextVotes,
    },
  };
}

function chooseMostVotedTarget(targetPlayerIds: Array<string | null | undefined>, shouldRandomizeTies = false) {
  const voteCounts = new Map<string, number>();

  for (const targetPlayerId of targetPlayerIds) {
    if (targetPlayerId) {
      voteCounts.set(targetPlayerId, (voteCounts.get(targetPlayerId) ?? 0) + 1);
    }
  }

  let selectedCount = 0;
  let topPlayerIds: string[] = [];

  for (const [playerId, voteCount] of voteCounts) {
    if (voteCount > selectedCount) {
      selectedCount = voteCount;
      topPlayerIds = [playerId];
    } else if (voteCount === selectedCount) {
      topPlayerIds.push(playerId);
    }
  }

  if (topPlayerIds.length === 0) {
    return null;
  }

  if (!shouldRandomizeTies || topPlayerIds.length === 1) {
    return topPlayerIds[0];
  }

  return topPlayerIds[Math.floor(Math.random() * topPlayerIds.length)];
}

function getNightActions(state: ClassicWolfState, nightNumber: number) {
  return state.nightActionsByNight[String(nightNumber)] ?? {};
}

function getStoredWolfAttackTargetForNight(state: ClassicWolfState, nightNumber: number) {
  const nightKey = String(nightNumber);

  return Object.prototype.hasOwnProperty.call(state.resolvedWolfAttackTargetByNight, nightKey)
    ? state.resolvedWolfAttackTargetByNight[nightKey] ?? null
    : undefined;
}

function getWolfAttackTargetForNight(state: ClassicWolfState, nightNumber: number) {
  const storedTargetPlayerId = getStoredWolfAttackTargetForNight(state, nightNumber);

  if (storedTargetPlayerId !== undefined) {
    return storedTargetPlayerId;
  }

  const actions = getNightActions(state, nightNumber);

  return chooseMostVotedTarget(
    Object.values(actions)
      .filter((action) => action.actionType === "werewolf")
      .map((action) => action.targetPlayerId)
  );
}

function getGuardTargetForNight(state: ClassicWolfState, nightNumber: number) {
  const actions = getNightActions(state, nightNumber);

  return (
    Object.values(actions)
      .filter((action) => action.actionType === "guard")
      .map((action) => action.targetPlayerId)
      .find(Boolean) ?? null
  );
}

function getWitchVictimPlayerIdForNight(state: ClassicWolfState, nightNumber: number) {
  const wolfTargetPlayerId = getWolfAttackTargetForNight(state, nightNumber);

  if (!wolfTargetPlayerId) {
    return null;
  }

  return wolfTargetPlayerId === getGuardTargetForNight(state, nightNumber) ? null : wolfTargetPlayerId;
}

function getHunterTargetForNight(state: ClassicWolfState, nightNumber: number, hunterPlayerId: string) {
  const action = getNightActions(state, nightNumber)[hunterPlayerId];

  return action?.actionType === "hunter" ? action.targetPlayerId : null;
}

function getHunterLinkedTargetPlayerIds(
  players: PlayerRow[],
  state: ClassicWolfState,
  hunterPlayerIds: string[],
  nightNumber: number
) {
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const playerIds = new Set(players.map((player) => player.id));
  const linkedTargetPlayerIds = new Set<string>();

  for (const hunterPlayerId of hunterPlayerIds) {
    if (state.roleByPlayerId[hunterPlayerId] !== "hunter") {
      continue;
    }

    const targetPlayerId = getHunterTargetForNight(state, nightNumber, hunterPlayerId);

    if (
      targetPlayerId &&
      targetPlayerId !== hunterPlayerId &&
      alivePlayerIds.has(targetPlayerId) &&
      playerIds.has(targetPlayerId)
    ) {
      linkedTargetPlayerIds.add(targetPlayerId);
    }
  }

  return Array.from(linkedTargetPlayerIds);
}

function getHunterLinkedDeathReason(players: PlayerRow[], state: ClassicWolfState, linkedTargetPlayerIds: string[]) {
  if (linkedTargetPlayerIds.length === 0) {
    return "";
  }

  return ` Thợ Săn kéo theo ${linkedTargetPlayerIds
    .map((playerId) => getPlayerName(players, playerId, state))
    .join(", ")}.`;
}

function getWolfAttackTarget(players: PlayerRow[], state: ClassicWolfState) {
  const storedTargetPlayerId = getStoredWolfAttackTargetForNight(state, state.nightNumber);

  if (storedTargetPlayerId !== undefined) {
    return storedTargetPlayerId;
  }

  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};

  return chooseMostVotedTarget(
    getAlivePlayersByRole(players, state, "werewolf").map((player) => actions[player.id]?.targetPlayerId)
  );
}

function resolveWolfAttackTarget(players: PlayerRow[], state: ClassicWolfState) {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};

  return chooseMostVotedTarget(
    getAlivePlayersByRole(players, state, "werewolf").map((player) => actions[player.id]?.targetPlayerId),
    true
  );
}

function areAllAliveWerewolvesReady(players: PlayerRow[], state: ClassicWolfState) {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};
  const aliveWerewolves = getAlivePlayersByRole(players, state, "werewolf");

  return aliveWerewolves.length > 0 && aliveWerewolves.every((player) => actions[player.id]?.actionType === "werewolf");
}

function ensureWolfAttackTargetResolved(players: PlayerRow[], state: ClassicWolfState) {
  const nightKey = String(state.nightNumber);

  if (
    Object.prototype.hasOwnProperty.call(state.resolvedWolfAttackTargetByNight, nightKey) ||
    !areAllAliveWerewolvesReady(players, state)
  ) {
    return state;
  }

  return {
    ...state,
    resolvedWolfAttackTargetByNight: {
      ...state.resolvedWolfAttackTargetByNight,
      [nightKey]: resolveWolfAttackTarget(players, state),
    },
  };
}

function getGuardTarget(players: PlayerRow[], state: ClassicWolfState) {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};

  return getAlivePlayersByRole(players, state, "guard")
    .map((player) => actions[player.id]?.targetPlayerId)
    .find(Boolean) ?? null;
}

function getPreviousGuardTargetPlayerId(players: PlayerRow[], state: ClassicWolfState) {
  if (state.nightNumber <= 1) {
    return null;
  }

  const previousActions = state.nightActionsByNight[String(state.nightNumber - 1)] ?? {};

  return players
    .filter((player) => state.roleByPlayerId[player.id] === "guard")
    .map((player) => previousActions[player.id]?.targetPlayerId)
    .find(Boolean) ?? null;
}

function getAvailableGuardTargetIds(players: PlayerRow[], state: ClassicWolfState) {
  const previousGuardTargetPlayerId = getPreviousGuardTargetPlayerId(players, state);

  return new Set(
    getAlivePlayers(players, state)
      .filter((player) => player.id !== previousGuardTargetPlayerId)
      .map((player) => player.id)
  );
}

function getWitchVictimPlayerId(players: PlayerRow[], state: ClassicWolfState) {
  const wolfTarget = getWolfAttackTarget(players, state);

  if (!wolfTarget) {
    return null;
  }

  return wolfTarget === getGuardTarget(players, state) ? null : wolfTarget;
}

function getWinningState(players: PlayerRow[], state: ClassicWolfState) {
  const alivePlayers = getAlivePlayers(players, state);
  const aliveWerewolves = alivePlayers.filter((player) => state.roleByPlayerId[player.id] === "werewolf");
  const aliveVillagers = alivePlayers.filter((player) => state.roleByPlayerId[player.id] !== "werewolf");

  if (aliveWerewolves.length === 0) {
    return {
      winnerTeam: "villagers" as const,
      winnerText: "Phe Dân Làng thắng. Không còn Ma Sói nào sống sót.",
    };
  }

  if (aliveWerewolves.length >= aliveVillagers.length) {
    return {
      winnerTeam: "werewolves" as const,
      winnerText: "Phe Ma Sói thắng. Số Sói còn sống đã áp đảo phe Dân Làng.",
    };
  }

  return null;
}

function applyDeaths(players: PlayerRow[], state: ClassicWolfState, deathEvent: ClassicWolfDeathEvent) {
  const deathPlayerIds = new Set(deathEvent.playerIds);
  const nextState: ClassicWolfState = {
    ...state,
    alivePlayerIds: state.alivePlayerIds.filter((playerId) => !deathPlayerIds.has(playerId)),
    deathEvents: [...state.deathEvents, deathEvent],
    pendingDeathEvent: deathEvent,
  };
  const winner = getWinningState(players, nextState);

  return winner
    ? {
        ...nextState,
        ...winner,
      }
    : nextState;
}

function hasRoleInGame(players: PlayerRow[], state: ClassicWolfState, role: ClassicWolfRole) {
  return players.some((player) => state.roleByPlayerId[player.id] === role);
}

function createHistoryLine(
  role: ClassicWolfNightHistoryLine["role"],
  text: string,
  icons: ClassicWolfNightHistoryIcon[] = []
): ClassicWolfNightHistoryLine {
  return { role, text, icons };
}

function buildClassicWolfNightHistory(players: PlayerRow[], state: ClassicWolfState): ClassicWolfNightHistoryItem[] {
  const nightNumbers = new Set<number>();

  for (const nightKey of Object.keys(state.nightActionsByNight)) {
    const nightNumber = Number(nightKey);

    if (Number.isInteger(nightNumber) && nightNumber > 0) {
      nightNumbers.add(nightNumber);
    }
  }

  for (const deathEvent of state.deathEvents) {
    if (deathEvent.phase === "night" || deathEvent.phase === "day") {
      nightNumbers.add(deathEvent.roundNumber);
    }
  }

  return Array.from(nightNumbers)
    .sort((firstNight, secondNight) => firstNight - secondNight)
    .map((nightNumber) => {
      const playerName = (playerId: string | null) => getPlayerName(players, playerId, state);
      const actions = getNightActions(state, nightNumber);
      const actionEntries = Object.entries(actions);
      const actionDescriptions: ClassicWolfNightHistoryLine[] = [];
      const guardActionEntry = actionEntries.find(([, action]) => action.actionType === "guard");
      const wolfActionEntries = actionEntries.filter(([, action]) => action.actionType === "werewolf");
      const seerActionEntries = actionEntries.filter(([, action]) => action.actionType === "seer");
      const witchActionEntry = actionEntries.find(([, action]) => action.actionType === "witch");
      const hunterActionEntries = actionEntries.filter(([, action]) => action.actionType === "hunter");
      const wolfAttackTargetPlayerId = getWolfAttackTargetForNight(state, nightNumber);
      const guardTargetPlayerId = getGuardTargetForNight(state, nightNumber);
      const witchVictimPlayerId = getWitchVictimPlayerIdForNight(state, nightNumber);
      let guardSummary = "-";
      let wolfSummary = "-";
      let seerSummary = "-";
      let witchSummary = "-";

      if (hasRoleInGame(players, state, "guard")) {
        const targetPlayerId = guardActionEntry?.[1].targetPlayerId ?? null;
        guardSummary = targetPlayerId
          ? `${playerName(guardActionEntry?.[0] ?? null)} -> ${playerName(targetPlayerId)}`
          : "Không hành động";
        actionDescriptions.push(
          targetPlayerId
            ? createHistoryLine("guard", `bảo vệ ${playerName(targetPlayerId)}`)
            : createHistoryLine("guard", "không dùng chức năng")
        );
      }

      if (hasRoleInGame(players, state, "werewolf")) {
        const wolfNames = wolfActionEntries.map(([playerId]) => playerName(playerId)).join(", ");
        const wasGuardedAttack = Boolean(wolfAttackTargetPlayerId && wolfAttackTargetPlayerId === guardTargetPlayerId);
        wolfSummary = wolfAttackTargetPlayerId
          ? `${wolfNames || "Ma Sói"} -> ${playerName(wolfAttackTargetPlayerId)}`
          : "Không cắn";
        actionDescriptions.push(
          wolfAttackTargetPlayerId
            ? createHistoryLine(
                "werewolf",
                `cắn ${playerName(wolfAttackTargetPlayerId)}${
                  wasGuardedAttack ? " (có khiên bảo vệ)" : ""
                }`,
                wasGuardedAttack ? ["shield"] : []
              )
            : createHistoryLine("werewolf", "không chọn được nạn nhân")
        );
      }

      if (hasRoleInGame(players, state, "seer")) {
        if (seerActionEntries.length > 0) {
          const seerSummaries: string[] = [];

          for (const [playerId, action] of seerActionEntries) {
            const targetRole = action.targetPlayerId ? state.roleByPlayerId[action.targetPlayerId] : null;
            seerSummaries.push(
              action.targetPlayerId
                ? `${playerName(playerId)} -> ${playerName(action.targetPlayerId)} (${
                    targetRole === "werewolf" ? "Sói" : "Không"
                  })`
                : `${playerName(playerId)} không soi`
            );
            actionDescriptions.push(
              action.targetPlayerId
                ? createHistoryLine(
                    "seer",
                    `soi ${playerName(action.targetPlayerId)} -> kết quả ${
                      targetRole === "werewolf" ? "sói" : "không phải sói"
                    }`
                  )
                : createHistoryLine("seer", "không soi ai")
            );
          }

          seerSummary = seerSummaries.join("; ");
        } else {
          seerSummary = "Không hành động";
          actionDescriptions.push(createHistoryLine("seer", "không dùng chức năng"));
        }
      }

      if (hasRoleInGame(players, state, "witch")) {
        const witchAction = witchActionEntry?.[1] ?? null;

        if (!witchAction) {
          witchSummary = "Không hành động";
          actionDescriptions.push(createHistoryLine("witch", "không dùng chức năng"));
        } else if (witchAction.useHeal && witchVictimPlayerId) {
          witchSummary = `Cứu ${playerName(witchVictimPlayerId)}`;
          actionDescriptions.push(
            createHistoryLine(
              "witch",
              `cứu ${playerName(witchVictimPlayerId)}`
            )
          );
        } else if (witchAction.targetPlayerId) {
          witchSummary = `Độc ${playerName(witchAction.targetPlayerId)}`;
          actionDescriptions.push(
            createHistoryLine(
              "witch",
              `dùng bình độc để ném ${playerName(witchAction.targetPlayerId)}`
            )
          );
        } else {
          witchSummary = "Không dùng";
          actionDescriptions.push(createHistoryLine("witch", "không dùng chức năng"));
        }
      }

      if (hasRoleInGame(players, state, "hunter")) {
        if (hunterActionEntries.length > 0) {
          for (const [, action] of hunterActionEntries) {
            actionDescriptions.push(
              action.targetPlayerId
                ? createHistoryLine("hunter", `chọn kéo theo ${playerName(action.targetPlayerId)}`)
                : createHistoryLine("hunter", "không chọn mục tiêu")
            );
          }
        } else {
          actionDescriptions.push(createHistoryLine("hunter", "không chọn mục tiêu"));
        }
      }

      const dayVotes = state.votesByDay[String(nightNumber)] ?? {};
      const voteEntries = Object.entries(dayVotes);
      const dayDeathPlayerIds = state.deathEvents
        .filter((deathEvent) => deathEvent.phase === "day" && deathEvent.roundNumber === nightNumber)
        .flatMap((deathEvent) => deathEvent.playerIds);
      const uniqueDayDeathPlayerIds = Array.from(new Set(dayDeathPlayerIds));

      if (voteEntries.length > 0 || uniqueDayDeathPlayerIds.length > 0) {
        const voteCountByTarget = new Map<string, number>();

        for (const [, targetPlayerId] of voteEntries) {
          if (targetPlayerId) {
            voteCountByTarget.set(targetPlayerId, (voteCountByTarget.get(targetPlayerId) ?? 0) + 1);
          }
        }

        const skippedVoteCount = voteEntries.filter(([, targetPlayerId]) => !targetPlayerId).length;
        const skipBlockedElimination = voteEntries.length > 0 && skippedVoteCount * 2 >= voteEntries.length;
        const topVoteCount = Math.max(0, ...voteCountByTarget.values());
        const topVotePlayerIds = getTopVotedPlayerIds(
          Array.from(voteCountByTarget.entries()).map(([playerId, votes]) => ({ playerId, votes })),
          topVoteCount
        );
        const voteSummary =
          skipBlockedElimination
            ? `${skippedVoteCount}/${voteEntries.length} lượt bỏ qua, không ai bị treo cổ`
            : topVotePlayerIds.length > 1
            ? `${topVotePlayerIds.map((playerId) => playerName(playerId)).join(", ")} hòa phiếu cao nhất (${topVoteCount} phiếu), không ai bị treo cổ`
            : topVotePlayerIds.length === 1
            ? `${topVotePlayerIds.map((playerId) => playerName(playerId)).join(", ")} nhận ${topVoteCount} phiếu`
            : "không ai bị treo cổ";

        actionDescriptions.push(
          createHistoryLine("vote", voteSummary)
        );
      }

      const nightDeathPlayerIds = state.deathEvents
        .filter((deathEvent) => deathEvent.phase === "night" && deathEvent.roundNumber === nightNumber)
        .flatMap((deathEvent) => deathEvent.playerIds);
      const uniqueNightDeathPlayerIds = Array.from(new Set(nightDeathPlayerIds));
      const uniqueDeathPlayerIds = Array.from(new Set([...uniqueNightDeathPlayerIds, ...uniqueDayDeathPlayerIds]));

      return {
        nightNumber,
        guardSummary,
        wolfSummary,
        seerSummary,
        witchSummary,
        actionDescriptions,
        deathPlayerIds: uniqueDeathPlayerIds,
        deathSummary:
          uniqueDeathPlayerIds.length > 0
            ? `Kết quả: Người chết: ${uniqueDeathPlayerIds.map((playerId) => playerName(playerId)).join(", ")}.`
            : "Kết quả: Không ai chết trong lượt này.",
      };
    });
}

function buildClassicWolfNightReminder(
  players: PlayerRow[],
  state: ClassicWolfState,
  currentPlayer: PlayerRow | null,
  phase: WolfGamePhase
): ClassicWolfPlayState["nightReminder"] {
  if (!currentPlayer || phase !== "discussion") {
    return null;
  }

  const role = state.roleByPlayerId[currentPlayer.id] ?? null;

  if (!role) {
    return null;
  }

  const nightNumber = state.nightNumber;
  const action = state.nightActionsByNight[String(nightNumber)]?.[currentPlayer.id] ?? null;
  const playerName = (playerId: string | null) => getPlayerName(players, playerId, state);
  const title = `Đêm ${nightNumber} · ${CLASSIC_WOLF_ROLE_LABELS[role]}`;

  if (role === "villager") {
    return {
      title,
      lines: ["Bạn là Dân Làng. Đêm này bạn không có hành động."],
    };
  }

  if (!action) {
    return {
      title,
      lines: ["Bạn chưa gửi hành động trong đêm này."],
    };
  }

  if (role === "guard") {
    return {
      title,
      lines: [
        action.targetPlayerId
          ? `Bạn đã bảo vệ ${playerName(action.targetPlayerId)}.`
          : "Bạn không bảo vệ ai trong đêm này.",
      ],
    };
  }

  if (role === "werewolf") {
    return {
      title,
      lines: [
        action.targetPlayerId
          ? `Bạn đã chọn cắn ${playerName(action.targetPlayerId)}.`
          : "Bạn không chọn nạn nhân trong đêm này.",
      ],
    };
  }

  if (role === "seer") {
    const targetRole = action.targetPlayerId ? state.roleByPlayerId[action.targetPlayerId] ?? null : null;

    return {
      title,
      lines: [
        action.targetPlayerId
          ? `Bạn đã soi ${playerName(action.targetPlayerId)}: ${
              targetRole === "werewolf" ? "Ma Sói" : "không phải Ma Sói"
            }.`
          : "Bạn không soi ai trong đêm này.",
      ],
    };
  }

  if (role === "witch") {
    const witchVictimPlayerId = getWitchVictimPlayerIdForNight(state, nightNumber);

    if (action.useHeal) {
      return {
        title,
        lines: [
          witchVictimPlayerId
            ? `Bạn đã dùng bình cứu ${playerName(witchVictimPlayerId)}.`
            : "Bạn đã chọn dùng bình cứu, nhưng đêm này không có nạn nhân để cứu.",
        ],
      };
    }

    if (action.targetPlayerId) {
      return {
        title,
        lines: [`Bạn đã dùng bình độc với ${playerName(action.targetPlayerId)}.`],
      };
    }

    return {
      title,
      lines: ["Bạn không dùng bình trong đêm này."],
    };
  }

  if (role === "hunter") {
    return {
      title,
      lines: [
        action.targetPlayerId
          ? `Bạn đã chọn kéo theo ${playerName(action.targetPlayerId)} nếu bị chết.`
          : "Bạn không chọn mục tiêu kéo theo trong đêm này.",
      ],
    };
  }

  return {
    title,
    lines: ["Vai của bạn không có hành động cần nhắc lại trong đêm này."],
  };
}

function getNightAutoPassTurn(state: ClassicWolfState, role: ClassicWolfNightRole) {
  return state.nightAutoPassByNight[String(state.nightNumber)]?.[role] ?? null;
}

function setNightAutoPassTurn(
  state: ClassicWolfState,
  role: ClassicWolfNightRole,
  turn: ClassicWolfNightAutoPassTurn
) {
  const nightKey = String(state.nightNumber);

  return {
    ...state,
    nightAutoPassByNight: {
      ...state.nightAutoPassByNight,
      [nightKey]: {
        ...(state.nightAutoPassByNight[nightKey] ?? {}),
        [role]: turn,
      },
    },
  };
}

function getRandomNightAutoPassEndsAt() {
  const delayMs =
    NIGHT_AUTO_PASS_MIN_MS + Math.floor(Math.random() * (NIGHT_AUTO_PASS_MAX_MS - NIGHT_AUTO_PASS_MIN_MS + 1));

  return new Date(Date.now() + delayMs).toISOString();
}

function getStableClassicNightHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getNightVillagerDecoysByAnchorRole(players: PlayerRow[], state: ClassicWolfState) {
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const anchorRoles = CLASSIC_WOLF_VILLAGER_DECOY_ANCHOR_ROLES.filter((role) =>
    players.some((player) => alivePlayerIds.has(player.id) && state.roleByPlayerId[player.id] === role)
  );
  const decoysByRole = new Map<ClassicWolfNightRole, PlayerRow[]>();

  if (anchorRoles.length === 0) {
    return decoysByRole;
  }

  const seed = [
    "classic-wolf-night-decoys",
    String(state.nightNumber),
    ...players.map((player) => `${player.id}:${state.roleByPlayerId[player.id] ?? "unknown"}`),
  ].join("|");
  const aliveVillagers = players
    .filter((player) => alivePlayerIds.has(player.id) && state.roleByPlayerId[player.id] === "villager")
    .map((player, index) => ({
      player,
      sortKey: getStableClassicNightHash(`${seed}:${player.id}:${index}`),
    }))
    .sort((first, second) => first.sortKey - second.sortKey || first.player.id.localeCompare(second.player.id))
    .map(({ player }) => player);

  aliveVillagers.forEach((player, index) => {
    const anchorIndex = getStableClassicNightHash(`${seed}:anchor:${player.id}:${index}`) % anchorRoles.length;
    const anchorRole = anchorRoles[anchorIndex];
    decoysByRole.set(anchorRole, [...(decoysByRole.get(anchorRole) ?? []), player]);
  });

  return decoysByRole;
}

function getActiveNightTurn(players: PlayerRow[], state: ClassicWolfState): ClassicWolfActiveNightTurn | null {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};
  const witchVictimPlayerId = getWitchVictimPlayerId(players, state);
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const villagerDecoysByAnchorRole = getNightVillagerDecoysByAnchorRole(players, state);

  for (const role of CLASSIC_WOLF_NIGHT_ROLE_ORDER) {
    const pendingVillagerDecoys = (villagerDecoysByAnchorRole.get(role) ?? []).filter(
      (player) => !hasPlayerConfirmedNightResult(player.id, state)
    );

    if (pendingVillagerDecoys.length > 0) {
      const nextVillagerDecoy = pendingVillagerDecoys[0];

      return {
        role: "villager",
        playerIds: [nextVillagerDecoy.id],
        playerNames: [nextVillagerDecoy.name],
        isAutoPass: false,
        autoPassEndsAt: null,
      };
    }

    const rolePlayers = players.filter((player) => state.roleByPlayerId[player.id] === role);
    const aliveRolePlayers = rolePlayers.filter((player) => alivePlayerIds.has(player.id));
    const pendingPlayers = aliveRolePlayers.filter((player) => {
      if (role === "seer") {
        return !actions[player.id] || !hasPlayerConfirmedNightResult(player.id, state);
      }

      if (role === "hunter") {
        return !actions[player.id] && getAlivePlayers(players, state).some((targetPlayer) => targetPlayer.id !== player.id);
      }

      if (role !== "witch") {
        return !actions[player.id];
      }

      const hasWitchAction = !state.witchPoisonUsed || (!state.witchHealUsed && Boolean(witchVictimPlayerId));
      return hasWitchAction && !actions[player.id];
    });

    if (pendingPlayers.length > 0) {
      return {
        role,
        playerIds: pendingPlayers.map((player) => player.id),
        playerNames: pendingPlayers.map((player) => player.name),
        isAutoPass: false,
        autoPassEndsAt: null,
      };
    }

    const autoPassTurn = getNightAutoPassTurn(state, role);

    if (rolePlayers.length > 0 && aliveRolePlayers.length === 0 && !autoPassTurn?.passed) {
      return {
        role,
        playerIds: [],
        playerNames: [],
        isAutoPass: true,
        autoPassEndsAt: autoPassTurn?.endsAt ?? null,
      };
    }
  }

  return null;
}

function resolveNight(players: PlayerRow[], state: ClassicWolfState) {
  const stateWithResolvedWolfTarget = ensureWolfAttackTargetResolved(players, state);
  const actions = stateWithResolvedWolfTarget.nightActionsByNight[String(stateWithResolvedWolfTarget.nightNumber)] ?? {};
  const witchVictimPlayerId = getWitchVictimPlayerId(players, stateWithResolvedWolfTarget);
  const witchAction = getAlivePlayersByRole(players, stateWithResolvedWolfTarget, "witch")
    .map((player) => actions[player.id])
    .find(Boolean);
  const deathPlayerIds = new Set<string>();
  let witchHealUsed = state.witchHealUsed;
  let witchPoisonUsed = state.witchPoisonUsed;

  if (witchVictimPlayerId) {
    deathPlayerIds.add(witchVictimPlayerId);
  }

  if (witchAction?.useHeal && witchVictimPlayerId && !witchHealUsed) {
    deathPlayerIds.delete(witchVictimPlayerId);
    witchHealUsed = true;
  }

  if (witchAction?.targetPlayerId && !witchPoisonUsed) {
    deathPlayerIds.add(witchAction.targetPlayerId);
    witchPoisonUsed = true;
  }

  const bittenHunterPlayerIds =
    witchVictimPlayerId && deathPlayerIds.has(witchVictimPlayerId) ? [witchVictimPlayerId] : [];
  const hunterLinkedTargetPlayerIds = getHunterLinkedTargetPlayerIds(
    players,
    stateWithResolvedWolfTarget,
    bittenHunterPlayerIds,
    stateWithResolvedWolfTarget.nightNumber
  );

  for (const targetPlayerId of hunterLinkedTargetPlayerIds) {
    deathPlayerIds.add(targetPlayerId);
  }

  const deathEvent: ClassicWolfDeathEvent = {
    roundNumber: state.nightNumber,
    phase: "night",
    playerIds: Array.from(deathPlayerIds),
    reason:
      deathPlayerIds.size > 0
        ? `Sau đêm ${state.nightNumber}, người chết đã được công bố.${getHunterLinkedDeathReason(
            players,
            stateWithResolvedWolfTarget,
            hunterLinkedTargetPlayerIds
          )}`
        : `Sau đêm ${state.nightNumber}, không ai chết.`,
  };

  return applyDeaths(players, { ...stateWithResolvedWolfTarget, witchHealUsed, witchPoisonUsed }, deathEvent);
}

function resolveVote(players: PlayerRow[], state: ClassicWolfState) {
  const voteCounts = getVoteCounts(players, state);
  const maxVotes = Math.max(0, ...voteCounts.map((voteCount) => voteCount.votes));
  const topVotedPlayerIds = getTopVotedPlayerIds(voteCounts, maxVotes);
  const alivePlayerCount = getAlivePlayers(players, state).length;
  const skippedVoteCount = getSkippedVoteCount(players, state);
  const skipBlocksElimination = alivePlayerCount > 0 && skippedVoteCount * 2 >= alivePlayerCount;
  const eliminatedPlayerIds =
    !skipBlocksElimination && topVotedPlayerIds.length === 1 ? topVotedPlayerIds : [];
  const hunterLinkedTargetPlayerIds = getHunterLinkedTargetPlayerIds(
    players,
    state,
    eliminatedPlayerIds,
    state.dayNumber
  );
  const deathPlayerIds = Array.from(new Set([...eliminatedPlayerIds, ...hunterLinkedTargetPlayerIds]));
  const deathEvent: ClassicWolfDeathEvent = {
    roundNumber: state.dayNumber,
    phase: "day",
    playerIds: deathPlayerIds,
    reason:
      skipBlocksElimination
        ? `Sau ngày ${state.dayNumber}, ${skippedVoteCount}/${alivePlayerCount} người còn sống bỏ qua nên không ai bị treo cổ.`
        : eliminatedPlayerIds.length === 1
        ? `Sau ngày ${state.dayNumber}, ${getPlayerName(players, eliminatedPlayerIds[0], state)} nhận nhiều phiếu nhất (${maxVotes} phiếu) và bị treo cổ.${getHunterLinkedDeathReason(
            players,
            state,
            hunterLinkedTargetPlayerIds
          )}`
        : topVotedPlayerIds.length > 1
          ? `Sau ngày ${state.dayNumber}, ${topVotedPlayerIds
              .map((playerId) => getPlayerName(players, playerId, state))
              .join(", ")} hòa phiếu cao nhất (${maxVotes} phiếu) nên không ai bị treo cổ.`
        : `Sau ngày ${state.dayNumber}, không ai bị treo cổ.`,
  };

  return applyDeaths(players, state, deathEvent);
}

function maybeFinishOrContinueAfterReview(players: PlayerRow[], state: ClassicWolfState) {
  if (state.winnerTeam) {
    return { phase: "result" as WolfGamePhase, state };
  }

  if (state.pendingDeathEvent?.phase === "day") {
    return {
      phase: "night" as WolfGamePhase,
      state: {
        ...state,
        nightNumber: state.nightNumber + 1,
        dayNumber: state.dayNumber + 1,
        pendingDeathEvent: null,
      },
    };
  }

  return {
    phase: "discussion" as WolfGamePhase,
    state: {
      ...state,
      pendingDeathEvent: null,
    },
  };
}

async function saveClassicGameState(
  gameId: string,
  state: ClassicWolfState,
  values: Partial<{ phase: WolfGamePhase; round_number: number; discussion_ends_at: string | null }> = {},
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient()
) {
  const stateMutation = supabase
    .from("classic_wolf_game_states")
    .upsert({ game_id: gameId, state }, { onConflict: "game_id" });

  if (Object.keys(values).length > 0) {
    await Promise.all([
      stateMutation,
      supabase.from("wolf_game_sessions").update(values).eq("id", gameId),
    ]);
    return;
  }

  await stateMutation;
}

async function loadClassicGameState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  players: PlayerRow[]
) {
  const { data, error } = await supabase
    .from("classic_wolf_game_states")
    .select("state, updated_at")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) {
    return { state: null, error };
  }

  return { state: parseClassicState(data?.state, players), updatedAt: data?.updated_at ?? null, error: null };
}

async function progressClassicNightAutoPassTurns(
  gameId: string,
  players: PlayerRow[],
  state: ClassicWolfState,
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  let nextState = state;
  let hasChanged = false;

  for (let index = 0; index < CLASSIC_WOLF_NIGHT_ROLE_ORDER.length; index += 1) {
    const activeTurn = getActiveNightTurn(players, nextState);

    if (!activeTurn?.isAutoPass) {
      break;
    }

    const autoPassTurn = getNightAutoPassTurn(nextState, activeTurn.role);

    if (!autoPassTurn) {
      nextState = setNightAutoPassTurn(nextState, activeTurn.role, {
        endsAt: getRandomNightAutoPassEndsAt(),
        passed: false,
      });
      hasChanged = true;
      break;
    }

    if (new Date(autoPassTurn.endsAt).getTime() > Date.now()) {
      break;
    }

    nextState = setNightAutoPassTurn(nextState, activeTurn.role, {
      ...autoPassTurn,
      passed: true,
    });
    hasChanged = true;
  }

  if (hasChanged) {
    await saveClassicGameState(gameId, nextState, {}, supabase);
  }

  return nextState;
}

async function maybeAutoAdvancePhase(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  room: RoomRow,
  players: PlayerRow[],
  game: { id: string; phase: WolfGamePhase; discussion_ends_at?: string | null },
  state: ClassicWolfState
) {
  if (game.phase === "card_reveal") {
    const readyPlayerIds = getPhaseReadyPlayerIds("card_reveal", state);

    if (readyPlayerIds.length >= players.length) {
      await saveClassicGameState(game.id, state, { phase: "night" }, supabase);
    }

    return;
  }

  if (game.phase === "night") {
    const progressedState = await progressClassicNightAutoPassTurns(game.id, players, state, supabase);

    if (getActiveNightTurn(players, progressedState)) {
      return;
    }

    const nextState = resolveNight(players, progressedState);
    await saveClassicGameState(
      game.id,
      nextState,
      {
        phase: nextState.winnerTeam ? "result" : "discussion",
        discussion_ends_at: nextState.winnerTeam
          ? null
          : new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString(),
      },
      supabase
    );
    return;
  }

  if (game.phase === "night_review") {
    const alivePlayers = getAlivePlayers(players, state);
    const readyPlayerIds = getPhaseReadyPlayerIds("night_review", state);

    if (readyPlayerIds.length >= alivePlayers.length) {
      const next = maybeFinishOrContinueAfterReview(players, state);
      await saveClassicGameState(
        game.id,
        next.state,
        {
          phase: next.phase,
          round_number: next.state.nightNumber,
          discussion_ends_at:
            next.phase === "discussion" ? new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString() : null,
        },
        supabase
      );
    }

    return;
  }

  if (game.phase === "discussion") {
    const alivePlayers = getAlivePlayers(players, state);
    const readyPlayerIds = getPhaseReadyPlayerIds("discussion", state);
    const { data: gameData } = await supabase
      .from("wolf_game_sessions")
      .select("discussion_ends_at")
      .eq("id", game.id)
      .maybeSingle();
    const discussionExpired = gameData?.discussion_ends_at
      ? new Date(gameData.discussion_ends_at).getTime() <= Date.now()
      : false;

    if (discussionExpired || readyPlayerIds.length >= alivePlayers.length) {
      await saveClassicGameState(
        game.id,
        state,
        {
          phase: "voting",
          discussion_ends_at: new Date(Date.now() + VOTING_DURATION_MS).toISOString(),
        },
        supabase
      );
    }

    return;
  }

  if (game.phase === "voting") {
    const alivePlayers = getAlivePlayers(players, state);
    const votes = state.votesByDay[String(state.dayNumber)] ?? {};
    const { data: gameData } = await supabase
      .from("wolf_game_sessions")
      .select("discussion_ends_at")
      .eq("id", game.id)
      .maybeSingle();
    const votingExpired = gameData?.discussion_ends_at
      ? new Date(gameData.discussion_ends_at).getTime() <= Date.now()
      : false;

    if (votingExpired || alivePlayers.every((player) => Object.prototype.hasOwnProperty.call(votes, player.id))) {
      const voteReadyState = votingExpired ? completeMissingVotesAsSkip(players, state) : state;
      const nextState = resolveVote(players, voteReadyState);
      const shouldSkipReview = Boolean(nextState.winnerTeam && getAlivePlayers(players, nextState).length === 0);

      await saveClassicGameState(
        game.id,
        nextState,
        {
          phase: shouldSkipReview ? "result" : "night_review",
          round_number: nextState.nightNumber,
          discussion_ends_at: null,
        },
        supabase
      );
    }
  }
}

export async function listPublicClassicWolfRooms(): Promise<ClassicWolfPublicRoomsResult> {
  return listPublicRoomsByGameKey(CLASSIC_WOLF_GAME_KEY);
}

export async function createClassicWolfRoom(
  playerName?: string,
  avatarKey?: string,
  isPublic = true,
  avatarObjectKey?: string | null
): Promise<ClassicWolfActionResult> {
  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const requestedAvatarObjectKey = getRequestedAvatarObjectKey(avatarObjectKey, sessionId);

  if (!requestedAvatarObjectKey.ok) {
    return { ok: false, error: requestedAvatarObjectKey.error };
  }

  const playerAvatarObjectKey = requestedAvatarObjectKey.avatarObjectKey;
  const playerAvatarUrl = getUploadedPlayerAvatarUrl(playerAvatarObjectKey);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("wolf_rooms")
      .insert({ code, game_key: CLASSIC_WOLF_GAME_KEY, is_public: isPublic })
      .select("id, code, status, host_player_id, created_at, updated_at, game_key")
      .single();

    if (roomError) {
      if (roomError.code === "23505") {
        continue;
      }

      return {
        ok: false,
        error:
          getRoomVisibilityErrorMessage(roomError) ??
          getDatabaseErrorMessage(roomError.code) ??
          "Không thể tạo phòng. Vui lòng thử lại.",
      };
    }

    const { data: hostPlayer, error: playerError } = await insertWolfRoomPlayer(supabase, {
      room_id: room.id,
      session_id: sessionId,
      name,
      avatar_key: playerAvatarKey,
      avatar_object_key: playerAvatarObjectKey,
      is_host: true,
      is_ready: true,
    });

    if (playerError || !hostPlayer) {
      await supabase.from("wolf_rooms").delete().eq("id", room.id);
      return {
        ok: false,
        error:
          getAvatarObjectKeyErrorMessage(playerError) ??
          "Không thể thêm người chơi vào phòng.",
      };
    }

    await supabase.from("wolf_rooms").update({ host_player_id: hostPlayer.id }).eq("id", room.id);
    await safeBroadcastWolfRoomUpdate(room.code);

    return {
      ok: true,
      roomCode: room.code,
      playerId: hostPlayer.id,
      playerName: name,
      playerAvatarKey,
      playerAvatarObjectKey,
      playerAvatarUrl,
    };
  }

  return { ok: false, error: "Không thể sinh mã phòng mới. Vui lòng thử lại." };
}

export async function joinClassicWolfRoom(
  roomCode: string,
  playerName?: string,
  avatarKey?: string,
  avatarObjectKey?: string | null
): Promise<ClassicWolfActionResult> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Mã phòng phải gồm đúng 4 chữ cái từ a đến z." };
  }

  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const requestedAvatarObjectKey = getRequestedAvatarObjectKey(avatarObjectKey, sessionId);

  if (!requestedAvatarObjectKey.ok) {
    return { ok: false, error: requestedAvatarObjectKey.error };
  }

  const playerAvatarObjectKey = requestedAvatarObjectKey.avatarObjectKey;
  const playerAvatarUrl = getUploadedPlayerAvatarUrl(playerAvatarObjectKey);
  const { data: room, error: roomError } = await supabase
    .from("wolf_rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", code)
    .eq("game_key", CLASSIC_WOLF_GAME_KEY)
    .maybeSingle();

  if (roomError || !room) {
    return {
      ok: false,
      error: getDatabaseErrorMessage(roomError?.code) ?? "Không tìm thấy phòng Ma Sói nhiều đêm.",
    };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng đã bắt đầu. Bạn chỉ có thể xem nếu có link phòng." };
  }

  const players = await getActivePlayers(supabase, room as RoomRow);
  const existingPlayer = players.find((player) => player.session_id === sessionId);

  if (existingPlayer) {
    const updateError = await updateWolfRoomPlayerIdentity(
      supabase,
      existingPlayer.id,
      name,
      playerAvatarKey,
      playerAvatarObjectKey
    );

    if (updateError) {
      return {
        ok: false,
        error:
          getAvatarObjectKeyErrorMessage(updateError) ??
          "Không thể cập nhật tên hoặc avatar người chơi.",
      };
    }

    await safeBroadcastWolfRoomUpdate(code);
    return {
      ok: true,
      roomCode: code,
      playerId: existingPlayer.id,
      playerName: name,
      playerAvatarKey,
      playerAvatarObjectKey,
      playerAvatarUrl,
    };
  }

  if (players.length >= MAX_PLAYERS) {
    return { ok: false, error: "Phòng đã đủ 10 người chơi." };
  }

  const { data: player, error: playerError } = await insertWolfRoomPlayer(supabase, {
    room_id: room.id,
    session_id: sessionId,
    name,
    avatar_key: playerAvatarKey,
    avatar_object_key: playerAvatarObjectKey,
    is_ready: false,
  });

  if (playerError || !player) {
    return {
      ok: false,
      error:
        getAvatarObjectKeyErrorMessage(playerError) ??
        "Không thể tham gia phòng.",
    };
  }

  await safeBroadcastWolfRoomUpdate(code);

  return {
    ok: true,
    roomCode: code,
    playerId: player.id,
    playerName: name,
    playerAvatarKey,
    playerAvatarObjectKey,
    playerAvatarUrl,
  };
}

export async function getClassicWolfLobbyState(roomCode: string): Promise<ClassicWolfLobbyState | null> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const { supabase, room } = await getRoomByCode(code);

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    players: players.map(mapLobbyPlayer),
    currentPlayerId: players.find((player) => player.session_id === sessionId)?.id ?? null,
  };
}

export async function toggleClassicWolfReady(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room || room.status !== "waiting") {
    return { ok: false, error: "Không thể cập nhật trạng thái sẵn sàng." };
  }

  const players = await getActivePlayers(supabase, room);
  const player = getCurrentPlayer(players, sessionId);

  if (!player) {
    return { ok: false, error: "Không thể cập nhật trạng thái sẵn sàng." };
  }

  await supabase.from("wolf_room_players").update({ is_ready: !player.is_ready }).eq("id", player.id);
  await safeBroadcastWolfRoomUpdate(room.code);

  return { ok: true };
}

export async function kickClassicWolfPlayer(
  roomCode: string,
  targetPlayerId: string
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room || room.status !== "waiting") {
    return { ok: false, error: "Không thể kick người chơi lúc này." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);
  const targetPlayer = players.find((player) => player.id === targetPlayerId);

  if (!isHost(currentPlayer, room) || !targetPlayer || targetPlayer.is_host) {
    return { ok: false, error: "Chỉ chủ phòng được kick người chơi khác." };
  }

  await supabase.from("wolf_room_players").delete().eq("id", targetPlayer.id);
  await safeBroadcastWolfRoomUpdate(room.code);

  return { ok: true };
}

export async function leaveClassicWolfRoom(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: true };
  }

  if (room.status !== "waiting") {
    return { ok: true };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: true };
  }

  await supabase.from("wolf_room_players").delete().eq("id", currentPlayer.id);

  if (currentPlayer.is_host) {
    const nextHost = players.find((player) => player.id !== currentPlayer.id);

    if (nextHost) {
      await supabase
        .from("wolf_room_players")
        .update({ is_host: true, is_ready: true })
        .eq("id", nextHost.id);
      await supabase.from("wolf_rooms").update({ host_player_id: nextHost.id }).eq("id", room.id);
    } else {
      await supabase.from("wolf_rooms").delete().eq("id", room.id);
    }
  }

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function startClassicWolfGame(
  roomCode: string,
  selectedRoles?: ClassicWolfRole[]
): Promise<ClassicWolfStartGameResult> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code) || !sessionId) {
    return { ok: false, error: "Không xác định được phòng hoặc người chơi." };
  }

  const { supabase, room, error } = await getRoomByCode(code);

  if (error || !room) {
    return {
      ok: false,
      error: getDatabaseErrorMessage(error?.code) ?? "Không tìm thấy phòng.",
    };
  }

  if (room.status === "playing" && room.current_game_id) {
    return { ok: true, roomCode: room.code, gameId: room.current_game_id };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng không còn ở trạng thái chờ." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được bắt đầu ván." };
  }

  if (players.length < MIN_PLAYERS) {
    return { ok: false, error: "Cần ít nhất 4 người chơi để bắt đầu Ma Sói nhiều đêm." };
  }

  const unreadyPlayer = players.find((player) => !player.is_ready);

  if (unreadyPlayer) {
    return { ok: false, error: "Còn người chơi chưa sẵn sàng." };
  }

  const roleDeckValidation = validateSelectedRoleDeck(selectedRoles, players.length);

  if (!roleDeckValidation.ok) {
    return roleDeckValidation;
  }

  const roles = shuffleRoles(roleDeckValidation.roles);
  const classicState = buildInitialClassicState(players, roles);
  const { data: game, error: gameError } = await supabase
    .from("wolf_game_sessions")
    .insert({
      room_id: room.id,
      phase: "card_reveal",
      round_number: 1,
    })
    .select("id")
    .single();

  if (gameError || !game) {
    return {
      ok: false,
      error: getDatabaseErrorMessage(gameError?.code) ?? "Không thể tạo ván mới.",
    };
  }

  const { error: stateError } = await supabase
    .from("classic_wolf_game_states")
    .insert({ game_id: game.id, state: classicState });

  if (stateError) {
    await supabase.from("wolf_game_sessions").delete().eq("id", game.id);
    return {
      ok: false,
      error: getDatabaseErrorMessage(stateError.code) ?? "Không thể tạo state Ma Sói nhiều đêm.",
    };
  }

  await supabase.from("wolf_rooms").update({ status: "playing", current_game_id: game.id }).eq("id", room.id);
  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true, roomCode: room.code, gameId: game.id };
}

// Retry đọc game state để hấp thụ độ trễ read-after-write của replica ngay sau khi
// ván vừa được tạo/chuyển phase (tránh 404 do state chưa kịp đồng bộ).
const PLAY_STATE_READ_RETRY_ATTEMPTS = 3;
const PLAY_STATE_READ_RETRY_DELAY_MS = 200;

function delayMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function getClassicWolfPlayState(roomCode: string): Promise<ClassicWolfPlayState | null> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const { supabase, room } = await getRoomByCode(code);
  const sessionId = await getPlayerSessionId();

  if (!room || !room.current_game_id) {
    return null;
  }

  const currentGameId = room.current_game_id;
  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  const readClassicGameSession = () =>
    supabase
      .from("wolf_game_sessions")
      .select("id, room_id, phase, round_number, discussion_ends_at")
      .eq("id", currentGameId)
      .maybeSingle();

  let gameData: Awaited<ReturnType<typeof readClassicGameSession>>["data"] = null;
  let state: Awaited<ReturnType<typeof loadClassicGameState>>["state"] = null;

  for (let attempt = 0; attempt < PLAY_STATE_READ_RETRY_ATTEMPTS; attempt += 1) {
    const { data } = await readClassicGameSession();
    if (data) {
      const loaded = await loadClassicGameState(supabase, data.id, players);
      if (!loaded.error && loaded.state) {
        gameData = data;
        state = loaded.state;
        break;
      }
    }
    if (attempt < PLAY_STATE_READ_RETRY_ATTEMPTS - 1) {
      await delayMs(PLAY_STATE_READ_RETRY_DELAY_MS);
    }
  }

  if (!gameData || !state) {
    return null;
  }
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const phaseReadyPlayerIds = getPhaseReadyPlayerIds(gameData.phase, state);
  const phaseReadyPlayerIdSet = new Set(phaseReadyPlayerIds);
  const dayVotes = state.votesByDay[String(state.dayNumber)] ?? {};
  const dayVoteSelections = state.voteSelectionsByDay[String(state.dayNumber)] ?? {};
  const myAction = currentPlayer
    ? state.nightActionsByNight[String(state.nightNumber)]?.[currentPlayer.id] ?? null
    : null;
  const shouldRevealRoles = gameData.phase === "result";
  const currentSeerReveal =
    currentPlayer && state.lastSeerRevealByPlayerId[currentPlayer.id]?.nightNumber === state.nightNumber
      ? state.lastSeerRevealByPlayerId[currentPlayer.id]
      : null;

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    game: {
      id: gameData.id,
      phase: gameData.phase,
      roundNumber: gameData.round_number,
      discussionEndsAt: gameData.phase === "discussion" ? gameData.discussion_ends_at : null,
      votingEndsAt: gameData.phase === "voting" ? gameData.discussion_ends_at : null,
    },
    players: players.map((player) => ({
      ...mapLobbyPlayer(player),
      role:
        shouldRevealRoles || player.id === currentPlayer?.id
          ? state.roleByPlayerId[player.id] ?? null
          : null,
      isAlive: alivePlayerIds.has(player.id),
      hasVoted: Object.prototype.hasOwnProperty.call(dayVotes, player.id),
      voteTargetPlayerId: dayVotes[player.id] ?? null,
      hasVoteSelection: Object.prototype.hasOwnProperty.call(dayVoteSelections, player.id),
      voteSelectionTargetPlayerId: dayVoteSelections[player.id] ?? null,
      isPhaseReady: phaseReadyPlayerIdSet.has(player.id),
    })),
    currentPlayerId: currentPlayer?.id ?? null,
    isCurrentPlayerHost: isHost(currentPlayer, room),
    myRole: currentPlayer ? state.roleByPlayerId[currentPlayer.id] ?? null : null,
    activeNightTurn: gameData.phase === "night" ? getActiveNightTurn(players, state) : null,
    myNightAction: myAction,
    seerReveal: currentSeerReveal
      ? {
          nightNumber: currentSeerReveal.nightNumber,
          targetPlayerId: currentSeerReveal.targetPlayerId,
          isWerewolf: currentSeerReveal.isWerewolf,
        }
      : null,
    nightReminder: buildClassicWolfNightReminder(players, state, currentPlayer, gameData.phase),
    wolfPack: buildWolfPackMembers(players, state, currentPlayer, gameData.phase),
    witchVictimPlayerId:
      currentPlayer && state.roleByPlayerId[currentPlayer.id] === "witch" && gameData.phase === "night"
        ? getWitchVictimPlayerId(players, state)
        : null,
    previousGuardTargetPlayerId:
      currentPlayer && state.roleByPlayerId[currentPlayer.id] === "guard" && gameData.phase === "night"
        ? getPreviousGuardTargetPlayerId(players, state)
        : null,
    pendingDeathEvent: state.pendingDeathEvent,
    deathEvents: state.deathEvents,
    phaseReadyPlayerIds,
    witchHealUsed: state.witchHealUsed,
    witchPoisonUsed: state.witchPoisonUsed,
    allVotesSubmitted: getAlivePlayers(players, state).every((player) =>
      Object.prototype.hasOwnProperty.call(dayVotes, player.id)
    ),
    result:
      gameData.phase === "result" && state.winnerTeam && state.winnerText
        ? {
            winnerTeam: state.winnerTeam,
            winnerText: state.winnerText,
          }
        : null,
    roleDeck: Object.values(state.roleByPlayerId),
    nightHistory: gameData.phase === "result" ? buildClassicWolfNightHistory(players, state) : [],
  };
}

export async function submitClassicWolfPhaseConfirmation(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || !["card_reveal", "night", "night_review", "discussion"].includes(gameData.phase)) {
    return { ok: false, error: "Giai đoạn này không cần xác nhận." };
  }

  const { state: currentState, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !currentState) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  if (gameData.phase !== "card_reveal" && !currentState.alivePlayerIds.includes(currentPlayer.id)) {
    return { ok: false, error: "Người đã chết không thể thực hiện chức năng." };
  }

  if (gameData.phase === "night") {
    const activeTurn = getActiveNightTurn(players, currentState);
    const myRole = currentState.roleByPlayerId[currentPlayer.id] ?? null;
    const myAction = currentState.nightActionsByNight[String(currentState.nightNumber)]?.[currentPlayer.id] ?? null;
    const seerReveal = currentState.lastSeerRevealByPlayerId[currentPlayer.id] ?? null;
    const isVillagerDecoyTurn =
      myRole === "villager" && activeTurn?.role === "villager" && activeTurn.playerIds.includes(currentPlayer.id);
    const isSeerRevealConfirmation =
      myRole === "seer" &&
      activeTurn?.role === "seer" &&
      activeTurn.playerIds.includes(currentPlayer.id) &&
      Boolean(myAction) &&
      seerReveal?.nightNumber === currentState.nightNumber;

    if (!isVillagerDecoyTurn && !isSeerRevealConfirmation) {
      return { ok: false, error: "Chưa có lượt ban đêm cần xác nhận." };
    }
  }

  const state = setPlayerPhaseReady(
    currentPlayer.id,
    gameData.phase,
    currentState
  );

  await saveClassicGameState(gameData.id, state, {}, supabase);
  await maybeAutoAdvancePhase(supabase, room, players, gameData, state);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function selectClassicWolfNightTarget(
  roomCode: string,
  targetPlayerId?: string | null
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "night") {
    return { ok: false, error: "Chưa đến giai đoạn ban đêm." };
  }

  const nextTargetPlayerId = targetPlayerId ?? null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: stateRecord, error: stateError } = await supabase
      .from("classic_wolf_game_states")
      .select("state, updated_at")
      .eq("game_id", gameData.id)
      .maybeSingle();

    if (stateError || !stateRecord) {
      return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
    }

    const state = parseClassicState(stateRecord.state, players);
    const myRole = state.roleByPlayerId[currentPlayer.id];
    const activeTurn = getActiveNightTurn(players, state);
    const alivePlayerIds = new Set(state.alivePlayerIds);
    const nightKey = String(state.nightNumber);
    const existingNightAction = state.nightActionsByNight[nightKey]?.[currentPlayer.id] ?? null;

    if (!alivePlayerIds.has(currentPlayer.id)) {
      return { ok: false, error: "Người đã chết không thể thực hiện chức năng." };
    }

    if (myRole !== "werewolf") {
      return { ok: false, error: "Chỉ Ma Sói mới có thể đồng bộ mục tiêu cắn." };
    }

    if (existingNightAction) {
      return { ok: true };
    }

    if (!activeTurn || activeTurn.role !== "werewolf" || !activeTurn.playerIds.includes(currentPlayer.id)) {
      return { ok: false, error: "Chưa tới lượt Ma Sói của bạn." };
    }

    if (nextTargetPlayerId) {
      if (!alivePlayerIds.has(nextTargetPlayerId) || nextTargetPlayerId === currentPlayer.id) {
        return { ok: false, error: "Mục tiêu được chọn không hợp lệ." };
      }

      if (state.roleByPlayerId[nextTargetPlayerId] === "werewolf") {
        return { ok: false, error: "Ma Sói không thể cắn đồng đội." };
      }
    }

    const currentSelections = state.nightSelectionsByNight[nightKey] ?? {};

    if ((currentSelections[currentPlayer.id]?.targetPlayerId ?? null) === nextTargetPlayerId) {
      return { ok: true };
    }

    const nextSelections = { ...currentSelections };

    if (nextTargetPlayerId) {
      nextSelections[currentPlayer.id] = {
        actionType: "werewolf",
        targetPlayerId: nextTargetPlayerId,
      };
    } else {
      delete nextSelections[currentPlayer.id];
    }

    const nextState: ClassicWolfState = {
      ...state,
      nightSelectionsByNight: {
        ...state.nightSelectionsByNight,
        [nightKey]: nextSelections,
      },
    };

    const { data: updatedRows, error: updateError } = await supabase
      .from("classic_wolf_game_states")
      .update({ state: nextState })
      .eq("game_id", gameData.id)
      .eq("updated_at", stateRecord.updated_at)
      .select("game_id");

    if (updateError) {
      return { ok: false, error: "Không thể lưu mục tiêu Ma Sói." };
    }

    if ((updatedRows ?? []).length > 0) {
      await safeBroadcastWolfPlayUpdate(room.code);
      return { ok: true };
    }
  }

  return { ok: false, error: "Không thể đồng bộ mục tiêu Ma Sói. Thử lại sau." };
}

export async function submitClassicWolfNightAction(
  roomCode: string,
  input: ClassicWolfNightActionInput
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "night") {
    return { ok: false, error: "Chưa đến giai đoạn ban đêm." };
  }

  const { state, updatedAt, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }
  const myRole = state.roleByPlayerId[currentPlayer.id];
  const activeTurn = getActiveNightTurn(players, state);
  const alivePlayerIds = new Set(state.alivePlayerIds);

  if (!alivePlayerIds.has(currentPlayer.id)) {
    return { ok: false, error: "Người đã chết không thể thực hiện chức năng." };
  }

  if (!myRole || !activeTurn || activeTurn.role !== myRole || !activeTurn.playerIds.includes(currentPlayer.id)) {
    return { ok: false, error: "Chưa tới lượt hành động của bạn." };
  }

  if (input.actionType !== myRole) {
    return { ok: false, error: "Hành động không khớp với role của bạn." };
  }

  if (input.targetPlayerId && !alivePlayerIds.has(input.targetPlayerId)) {
    return { ok: false, error: "Mục tiêu được chọn không hợp lệ." };
  }

  const witchVictimPlayerId = getWitchVictimPlayerId(players, state);
  const requestedTargetPlayerId = input.targetPlayerId ?? null;
  const actionTargetPlayerId = requestedTargetPlayerId;

  if (myRole === "werewolf" && actionTargetPlayerId && state.roleByPlayerId[actionTargetPlayerId] === "werewolf") {
    return { ok: false, error: "Ma Sói không thể cắn đồng đội." };
  }

  if (myRole === "hunter" && actionTargetPlayerId === currentPlayer.id) {
    return { ok: false, error: "Thợ Săn cần chọn một người chơi khác." };
  }

  if (myRole === "witch" && input.useHeal && requestedTargetPlayerId) {
    return { ok: false, error: "Phù Thuỷ không thể dùng bình cứu và bình độc trong cùng một đêm." };
  }

  if (myRole === "witch" && input.useHeal && state.witchHealUsed) {
    return { ok: false, error: "Bình cứu đã được sử dụng." };
  }

  if (myRole === "witch" && input.useHeal && !witchVictimPlayerId) {
    return { ok: false, error: "Đêm này Phù Thuỷ không thấy ai bị cắn để cứu." };
  }

  if (myRole === "witch" && actionTargetPlayerId && state.witchPoisonUsed) {
    return { ok: false, error: "Bình độc đã được sử dụng." };
  }

  if (myRole === "guard") {
    const availableGuardTargetIds = getAvailableGuardTargetIds(players, state);

    if (actionTargetPlayerId && !availableGuardTargetIds.has(actionTargetPlayerId)) {
      return { ok: false, error: "Bảo Vệ không thể bảo vệ cùng một người trong hai đêm liên tiếp." };
    }

    if (!actionTargetPlayerId && availableGuardTargetIds.size > 0) {
      return { ok: false, error: "Bảo Vệ cần chọn một mục tiêu hợp lệ." };
    }
  }

  if (myRole !== "witch" && myRole !== "guard" && !actionTargetPlayerId) {
    return { ok: false, error: "Bạn cần chọn một mục tiêu." };
  }

  const nightKey = String(state.nightNumber);
  const existingNightAction = state.nightActionsByNight[nightKey]?.[currentPlayer.id] ?? null;

  if (existingNightAction) {
    return myRole === "seer"
      ? { ok: false, error: "Bạn đã soi xong. Hãy xem kết quả và bấm OK để tiếp tục." }
      : { ok: false, error: "Bạn đã gửi hành động trong lượt này." };
  }

  const nextActions = {
    ...(state.nightActionsByNight[nightKey] ?? {}),
    [currentPlayer.id]: {
      actionType: myRole,
      targetPlayerId: actionTargetPlayerId,
      useHeal: Boolean(input.useHeal),
    },
  };
  const nextSelections = { ...(state.nightSelectionsByNight[nightKey] ?? {}) };
  delete nextSelections[currentPlayer.id];

  let nextState: ClassicWolfState = {
    ...state,
    nightActionsByNight: {
      ...state.nightActionsByNight,
      [nightKey]: nextActions,
    },
    nightSelectionsByNight: {
      ...state.nightSelectionsByNight,
      [nightKey]: nextSelections,
    },
  };

  if (myRole === "seer" && input.targetPlayerId) {
    const targetRole = nextState.roleByPlayerId[input.targetPlayerId];
    nextState = {
      ...nextState,
      lastSeerRevealByPlayerId: {
        ...nextState.lastSeerRevealByPlayerId,
        [currentPlayer.id]: {
          nightNumber: nextState.nightNumber,
          targetPlayerId: input.targetPlayerId,
          targetRole,
          isWerewolf: targetRole === "werewolf",
        },
      },
    };
  }

  if (myRole === "werewolf") {
    nextState = ensureWolfAttackTargetResolved(players, nextState);
  }

  if (updatedAt) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("classic_wolf_game_states")
      .update({ state: nextState })
      .eq("game_id", gameData.id)
      .eq("updated_at", updatedAt)
      .select("game_id");

    if (updateError) {
      return { ok: false, error: "Không thể lưu hành động ban đêm." };
    }

    if ((updatedRows ?? []).length === 0) {
      return { ok: false, error: "Trạng thái ván vừa thay đổi. Hãy thử lại." };
    }
  } else {
    await saveClassicGameState(gameData.id, nextState, {}, supabase);
  }

  await maybeAutoAdvancePhase(supabase, room, players, gameData, nextState);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function advanceClassicWolfNightAutoPassIfReady(
  roomCode: string
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "night") {
    return { ok: true };
  }

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, gameData, state);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function selectClassicWolfVoteTarget(
  roomCode: string,
  targetPlayerId?: string | null
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "voting") {
    return { ok: false, error: "Chưa đến giai đoạn bỏ phiếu." };
  }

  if (gameData.discussion_ends_at && new Date(gameData.discussion_ends_at).getTime() <= Date.now()) {
    return { ok: true };
  }

  const nextTargetPlayerId = targetPlayerId ?? null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: stateRecord, error: stateError } = await supabase
      .from("classic_wolf_game_states")
      .select("state, updated_at")
      .eq("game_id", gameData.id)
      .maybeSingle();

    if (stateError || !stateRecord) {
      return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
    }

    const state = parseClassicState(stateRecord.state, players);
    const alivePlayerIds = new Set(state.alivePlayerIds);

    if (!alivePlayerIds.has(currentPlayer.id)) {
      return { ok: false, error: "Người đã chết không thể bỏ phiếu." };
    }

    if (targetPlayerId && !alivePlayerIds.has(targetPlayerId)) {
      return { ok: false, error: "Người chơi được chọn không hợp lệ." };
    }

    const dayKey = String(state.dayNumber);
    const currentVotes = state.votesByDay[dayKey] ?? {};

    if (Object.prototype.hasOwnProperty.call(currentVotes, currentPlayer.id)) {
      return { ok: true };
    }

    const currentSelections = state.voteSelectionsByDay[dayKey] ?? {};

    if (
      Object.prototype.hasOwnProperty.call(currentSelections, currentPlayer.id) &&
      currentSelections[currentPlayer.id] === nextTargetPlayerId
    ) {
      return { ok: true };
    }

    const nextState = {
      ...state,
      voteSelectionsByDay: {
        ...state.voteSelectionsByDay,
        [dayKey]: {
          ...currentSelections,
          [currentPlayer.id]: nextTargetPlayerId,
        },
      },
    };

    const { data: updatedRows, error: updateError } = await supabase
      .from("classic_wolf_game_states")
      .update({ state: nextState })
      .eq("game_id", gameData.id)
      .eq("updated_at", stateRecord.updated_at)
      .select("game_id");

    if (updateError) {
      return { ok: false, error: "Không thể lưu lựa chọn vote." };
    }

    if ((updatedRows ?? []).length > 0) {
      await safeBroadcastWolfPlayUpdate(room.code);
      return { ok: true };
    }
  }

  return { ok: false, error: "Không thể đồng bộ lựa chọn vote. Thử lại sau." };
}

export async function submitClassicWolfVote(
  roomCode: string,
  targetPlayerId?: string | null
): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "voting") {
    return { ok: false, error: "Chưa đến giai đoạn bỏ phiếu." };
  }

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  if (gameData.discussion_ends_at && new Date(gameData.discussion_ends_at).getTime() <= Date.now()) {
    const skippedState = completeMissingVotesAsSkip(players, state);
    await maybeAutoAdvancePhase(supabase, room, players, gameData, skippedState);
    await safeBroadcastWolfPlayUpdate(room.code);

    return { ok: true };
  }

  const nextTargetPlayerId = targetPlayerId ?? null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: stateRecord, error: stateRecordError } = await supabase
      .from("classic_wolf_game_states")
      .select("state, updated_at")
      .eq("game_id", gameData.id)
      .maybeSingle();

    if (stateRecordError || !stateRecord) {
      return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
    }

    const latestState = parseClassicState(stateRecord.state, players);
    const alivePlayerIds = new Set(latestState.alivePlayerIds);

    if (!alivePlayerIds.has(currentPlayer.id)) {
      return { ok: false, error: "Người đã chết không thể bỏ phiếu." };
    }

    if (targetPlayerId && !alivePlayerIds.has(targetPlayerId)) {
      return { ok: false, error: "Người chơi được chọn không hợp lệ." };
    }

    const dayKey = String(latestState.dayNumber);
    const currentVotes = latestState.votesByDay[dayKey] ?? {};
    const currentVoteSelections = latestState.voteSelectionsByDay[dayKey] ?? {};

    if (Object.prototype.hasOwnProperty.call(currentVotes, currentPlayer.id)) {
      return { ok: true };
    }

    const nextVoteSelections = { ...currentVoteSelections };
    delete nextVoteSelections[currentPlayer.id];

    const nextState = {
      ...latestState,
      votesByDay: {
        ...latestState.votesByDay,
        [dayKey]: {
          ...currentVotes,
          [currentPlayer.id]: nextTargetPlayerId,
        },
      },
      voteSelectionsByDay: {
        ...latestState.voteSelectionsByDay,
        [dayKey]: nextVoteSelections,
      },
    };

    const { data: updatedRows, error: updateError } = await supabase
      .from("classic_wolf_game_states")
      .update({ state: nextState })
      .eq("game_id", gameData.id)
      .eq("updated_at", stateRecord.updated_at)
      .select("game_id");

    if (updateError) {
      return { ok: false, error: "Không thể lưu phiếu bầu." };
    }

    if ((updatedRows ?? []).length > 0) {
      await maybeAutoAdvancePhase(supabase, room, players, gameData, nextState);
      await safeBroadcastWolfPlayUpdate(room.code);
      return { ok: true };
    }
  }

  return { ok: false, error: "Không thể đồng bộ phiếu bầu. Thử lại sau." };
}

export async function advanceClassicWolfDiscussionIfExpired(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "discussion") {
    return { ok: true };
  }

  if (!gameData.discussion_ends_at || new Date(gameData.discussion_ends_at).getTime() > Date.now()) {
    return { ok: true };
  }

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }
  await maybeAutoAdvancePhase(supabase, room, players, gameData, state);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function advanceClassicWolfVotingIfExpired(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData || gameData.phase !== "voting") {
    return { ok: true };
  }

  if (!gameData.discussion_ends_at || new Date(gameData.discussion_ends_at).getTime() > Date.now()) {
    return { ok: true };
  }

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  const skippedState = completeMissingVotesAsSkip(players, state);
  await maybeAutoAdvancePhase(supabase, room, players, gameData, skippedState);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function finishClassicWolfGame(roomCode: string): Promise<ClassicWolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được đưa mọi người về phòng chờ." };
  }

  await supabase.from("wolf_rooms").update({ status: "waiting", current_game_id: null }).eq("id", room.id);
  await supabase
    .from("wolf_room_players")
    .update({ is_ready: false })
    .eq("room_id", room.id);
  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}
