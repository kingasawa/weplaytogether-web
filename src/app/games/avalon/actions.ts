"use server";

import { cookies } from "next/headers";
import {
  AVALON_GAME_KEY,
  AVALON_MAX_PLAYERS,
  AVALON_MIN_PLAYERS,
  AVALON_PHASE_LABELS,
  AVALON_ROLE_DESCRIPTIONS,
  AVALON_ROLE_ORDER,
  buildRecommendedAvalonDeck,
  getAvailableAvalonQuestIndexes,
  getAvalonQuestRequiredFails,
  getAvalonQuestTeamSize,
  getAvalonRoleTeam,
  isAvalonEvilRole,
  validateAvalonDeck,
  type AvalonPhase,
  type AvalonQuestCard,
  type AvalonQuestOutcome,
  type AvalonRole,
  type AvalonRolePreset,
  type AvalonTeam,
  type AvalonTeamVote,
} from "@/lib/avalon-game";
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

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;

type RoomRow = {
  id: string;
  code: string;
  game_key?: string;
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

type GameRow = {
  id: string;
  room_id: string;
  phase: WolfGamePhase;
  round_number: number;
  discussion_ends_at: string | null;
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

type AvalonQuestResult = {
  questIndex: number;
  teamPlayerIds: string[];
  failCount: number;
  requiredFails: number;
  outcome: AvalonQuestOutcome;
  leaderPlayerId: string;
  proposalAttempt: number;
  votesByPlayerId: Record<string, AvalonTeamVote>;
};

type AvalonLadyInspection = {
  questIndex: number;
  holderPlayerId: string;
  targetPlayerId: string;
  loyalty: AvalonTeam;
};

type AvalonQuestRevealState = {
  questIndex: number | null;
  cards: AvalonQuestCard[];
  revealedCount: number;
  result: AvalonQuestResult | null;
};

type AvalonGameState = {
  version: 1;
  phase: AvalonPhase;
  playerOrderIds: string[];
  playerNameByPlayerId: Record<string, string>;
  playerAvatarKeyByPlayerId: Record<string, string>;
  playerAvatarObjectKeyByPlayerId: Record<string, string | null>;
  roleByPlayerId: Record<string, AvalonRole>;
  leaderIndex: number;
  questIndex: number;
  proposedQuestIndex: number | null;
  proposalAttempt: number;
  selectedTeamPlayerIds: string[];
  teamVotesByPlayerId: Record<string, AvalonTeamVote>;
  questCardsByPlayerId: Record<string, AvalonQuestCard>;
  questResults: AvalonQuestResult[];
  questReveal: AvalonQuestRevealState;
  phaseConfirmations: Record<string, string[]>;
  options: {
    rolePreset: AvalonRolePreset;
    ladyOfLake: boolean;
    targeting: boolean;
  };
  ladyOfLake: {
    enabled: boolean;
    holderPlayerId: string | null;
    pendingAfterQuestIndex: number | null;
    usedByPlayerIds: string[];
    inspections: AvalonLadyInspection[];
  };
  assassination: {
    assassinPlayerId: string | null;
    targetPlayerId: string | null;
    guessedCorrect: boolean | null;
  };
  winnerTeam: AvalonTeam | null;
  winnerText: string | null;
  winnerReason: string | null;
};

export type AvalonLobbyPlayer = {
  id: string;
  name: string;
  avatarKey: string;
  avatarObjectKey: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type AvalonLobbyState = {
  room: {
    id: string;
    code: string;
    status: WolfRoomStatus;
    hostPlayerId: string | null;
    currentGameId: string | null;
  };
  players: AvalonLobbyPlayer[];
  currentPlayerId: string | null;
};

export type AvalonPublicRoomSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  updatedAt: string;
};

export type AvalonPublicRoomsResult =
  | {
      ok: true;
      rooms: AvalonPublicRoomSummary[];
    }
  | {
      ok: false;
      error: string;
    };

export type AvalonActionResult =
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

export type AvalonStartGameInput = {
  rolePreset?: AvalonRolePreset;
  selectedRoles?: AvalonRole[];
  ladyOfLake?: boolean;
};

export type AvalonStartGameResult =
  | {
      ok: true;
      roomCode: string;
      gameId: string;
    }
  | {
      ok: false;
      error: string;
    };

export type AvalonMutationResult = { ok: true } | { ok: false; error: string };

export type AvalonPlayPlayer = AvalonLobbyPlayer & {
  role: AvalonRole | null;
  loyalty: AvalonTeam | null;
  isOnQuestTeam: boolean;
  hasConfirmedRole: boolean;
  hasTeamVoted: boolean;
  teamVote: AvalonTeamVote | null;
  hasQuestSubmitted: boolean;
};

export type AvalonQuestResultSummary = AvalonQuestResult & {
  questNumber: number;
  teamNames: string[];
  leaderName: string;
  approveCount: number;
  rejectCount: number;
};

export type AvalonPrivateKnownPlayer = {
  playerId: string;
  playerName: string;
  role: AvalonRole | null;
  loyalty: AvalonTeam | null;
  note: string;
};

export type AvalonPrivateInfo = {
  roleDescription: string | null;
  knownPlayers: AvalonPrivateKnownPlayer[];
  ladyInspections: Array<{
    questNumber: number;
    targetPlayerId: string;
    targetName: string;
    loyalty: AvalonTeam;
  }>;
};

export type AvalonPlayState = {
  room: AvalonLobbyState["room"];
  game: {
    id: string;
    phase: AvalonPhase;
    phaseLabel: string;
    questIndex: number;
    proposedQuestIndex: number | null;
    proposalAttempt: number;
  };
  players: AvalonPlayPlayer[];
  currentPlayerId: string | null;
  isCurrentPlayerHost: boolean;
  leaderPlayerId: string | null;
  leaderName: string;
  selectedTeamPlayerIds: string[];
  requiredTeamSize: number;
  availableQuestIndexes: number[];
  questResults: AvalonQuestResultSummary[];
  successCount: number;
  failCount: number;
  myRole: AvalonRole | null;
  myLoyalty: AvalonTeam | null;
  myTeamVote: AvalonTeamVote | null;
  myQuestCard: AvalonQuestCard | null;
  privateInfo: AvalonPrivateInfo;
  isTeamVoteRevealed: boolean;
  teamVoteCounts: {
    approve: number;
    reject: number;
  };
  questReveal: {
    questIndex: number | null;
    revealedCount: number;
    totalCount: number;
    revealedCards: AvalonQuestCard[];
    isComplete: boolean;
  };
  ladyOfLake: {
    enabled: boolean;
    holderPlayerId: string | null;
    holderName: string;
    pendingAfterQuestIndex: number | null;
    usedByPlayerIds: string[];
  };
  assassination: AvalonGameState["assassination"];
  result: {
    winnerTeam: AvalonTeam;
    winnerText: string;
    winnerReason: string;
  } | null;
  options: AvalonGameState["options"];
  roleDeckSummary: Array<{
    role: AvalonRole;
    count: number;
  }>;
};

export type AvalonSpectatorState = {
  room: AvalonLobbyState["room"];
  players: AvalonLobbyPlayer[];
  game:
    | {
        phase: AvalonPhase;
        phaseLabel: string;
      }
    | null;
  result: AvalonPlayState["result"];
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
    return "Database chưa có bảng Avalon. Cần chạy migration Supabase mới.";
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

  return errorText.includes("is_public")
    ? "Database chưa có cột public/private cho phòng chơi. Cần chạy migration wolf_room_visibility trước."
    : null;
}

function shuffleRoles(roles: AvalonRole[]) {
  const shuffled = [...roles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    const swapIndex = randomByte[0] % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function shuffleQuestCards(cards: AvalonQuestCard[]) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    const swapIndex = randomByte[0] % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function createEmptyQuestReveal(): AvalonQuestRevealState {
  return {
    questIndex: null,
    cards: [],
    revealedCount: 0,
    result: null,
  };
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
    .eq("game_key", AVALON_GAME_KEY)
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

async function insertRoomPlayer(
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
  const { data, error } = await supabase.from("wolf_room_players").insert(insertValues).select("id").single();

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

async function updateRoomPlayerIdentity(
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

function mapLobbyPlayer(player: PlayerRow): AvalonLobbyPlayer {
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
): AvalonPublicRoomSummary[] {
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
        maxPlayers: AVALON_MAX_PLAYERS,
        updatedAt: room.updated_at,
      };
    })
    .filter((room) => room.playerCount > 0);
}

function getCurrentPlayer(players: PlayerRow[], sessionId: string | null) {
  return players.find((player) => player.session_id === sessionId) ?? null;
}

function isHost(player: PlayerRow | null, room: RoomRow) {
  return Boolean(player && (player.is_host || player.id === room.host_player_id));
}

function getPlayerNameFromState(state: AvalonGameState, playerId: string | null) {
  if (!playerId) {
    return "Không rõ";
  }

  return state.playerNameByPlayerId[playerId] ?? "Người chơi đã rời";
}

function getLivePlayerById(players: PlayerRow[], playerId: string) {
  return players.find((player) => player.id === playerId) ?? null;
}

function getLeaderPlayerId(state: AvalonGameState) {
  if (state.playerOrderIds.length === 0) {
    return null;
  }

  return state.playerOrderIds[state.leaderIndex % state.playerOrderIds.length] ?? null;
}

function getQuestCounts(state: AvalonGameState) {
  return {
    success: state.questResults.filter((result) => result.outcome === "success").length,
    fail: state.questResults.filter((result) => result.outcome === "fail").length,
  };
}

function getCompletedQuestIndexes(state: AvalonGameState) {
  return state.questResults.map((result) => result.questIndex);
}

function getNextLeaderIndex(state: AvalonGameState) {
  return state.playerOrderIds.length > 0 ? (state.leaderIndex + 1) % state.playerOrderIds.length : 0;
}

function mapAvalonPhaseToSessionPhase(phase: AvalonPhase): WolfGamePhase {
  if (phase === "role_reveal") {
    return "card_reveal";
  }

  if (phase === "team_vote") {
    return "voting";
  }

  if (phase === "quest" || phase === "quest_reveal") {
    return "night";
  }

  if (phase === "result") {
    return "result";
  }

  return "discussion";
}

async function syncSessionPhase(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  phase: AvalonPhase
) {
  await supabase
    .from("wolf_game_sessions")
    .update({ phase: mapAvalonPhaseToSessionPhase(phase) })
    .eq("id", gameId);
}

function createResultState(
  state: AvalonGameState,
  winnerTeam: AvalonTeam,
  winnerText: string,
  winnerReason: string
): AvalonGameState {
  return {
    ...state,
    phase: "result",
    selectedTeamPlayerIds: [],
    teamVotesByPlayerId: {},
    questCardsByPlayerId: {},
    questReveal: createEmptyQuestReveal(),
    ladyOfLake: {
      ...state.ladyOfLake,
      pendingAfterQuestIndex: null,
    },
    winnerTeam,
    winnerText,
    winnerReason,
  };
}

function beginNextProposalState(state: AvalonGameState): AvalonGameState {
  const availableQuestIndexes = getAvailableAvalonQuestIndexes(getCompletedQuestIndexes(state));
  const nextQuestIndex = availableQuestIndexes[0] ?? state.questIndex;

  return {
    ...state,
    phase: "team_proposal",
    questIndex: nextQuestIndex,
    proposedQuestIndex: nextQuestIndex,
    proposalAttempt: 1,
    selectedTeamPlayerIds: [],
    teamVotesByPlayerId: {},
    questCardsByPlayerId: {},
    questReveal: createEmptyQuestReveal(),
  };
}

function normalizeConfirmations(confirmations: unknown): Record<string, string[]> {
  if (!confirmations || typeof confirmations !== "object") {
    return {};
  }

  const normalized: Record<string, string[]> = {};

  for (const [phase, playerIds] of Object.entries(confirmations as Record<string, unknown>)) {
    if (Array.isArray(playerIds)) {
      normalized[phase] = playerIds.filter((playerId): playerId is string => typeof playerId === "string");
    }
  }

  return normalized;
}

function parseAvalonState(rawState: unknown, players: PlayerRow[]): AvalonGameState {
  const playerOrderIds = players.map((player) => player.id);
  const fallbackRoles = buildRecommendedAvalonDeck(Math.max(AVALON_MIN_PLAYERS, players.length));
  const fallbackRoleByPlayerId = Object.fromEntries(
    playerOrderIds.map((playerId, index) => [playerId, fallbackRoles[index] ?? "loyal_servant"])
  ) as Record<string, AvalonRole>;

  const fallback: AvalonGameState = {
    version: 1,
    phase: "role_reveal",
    playerOrderIds,
    playerNameByPlayerId: Object.fromEntries(players.map((player) => [player.id, player.name])),
    playerAvatarKeyByPlayerId: Object.fromEntries(
      players.map((player) => [player.id, normalizePlayerAvatarKey(player.avatar_key)])
    ),
    roleByPlayerId: fallbackRoleByPlayerId,
    leaderIndex: 0,
    questIndex: 0,
    proposedQuestIndex: 0,
    proposalAttempt: 1,
    selectedTeamPlayerIds: [],
    teamVotesByPlayerId: {},
    questCardsByPlayerId: {},
    questResults: [],
    questReveal: createEmptyQuestReveal(),
    phaseConfirmations: {},
    options: {
      rolePreset: "recommended",
      ladyOfLake: false,
      targeting: false,
    },
    ladyOfLake: {
      enabled: false,
      holderPlayerId: null,
      pendingAfterQuestIndex: null,
      usedByPlayerIds: [],
      inspections: [],
    },
    assassination: {
      assassinPlayerId: null,
      targetPlayerId: null,
      guessedCorrect: null,
    },
    winnerTeam: null,
    winnerText: null,
    winnerReason: null,
  };

  if (!rawState || typeof rawState !== "object") {
    return fallback;
  }

  const state = rawState as Partial<AvalonGameState>;
  const phase = state.phase && AVALON_PHASE_LABELS[state.phase] ? state.phase : fallback.phase;
  const rawQuestReveal =
    state.questReveal && typeof state.questReveal === "object" ? state.questReveal : fallback.questReveal;
  const questRevealCards = Array.isArray(rawQuestReveal.cards)
    ? rawQuestReveal.cards.filter((card): card is AvalonQuestCard => card === "success" || card === "fail")
    : [];
  const options = {
    ...fallback.options,
    ...(state.options ?? {}),
    targeting: false,
  };
  const ladyOfLake = {
    ...fallback.ladyOfLake,
    ...(state.ladyOfLake ?? {}),
    inspections: Array.isArray(state.ladyOfLake?.inspections) ? state.ladyOfLake.inspections : [],
    usedByPlayerIds: Array.isArray(state.ladyOfLake?.usedByPlayerIds)
      ? state.ladyOfLake.usedByPlayerIds
      : [],
  };

  return {
    ...fallback,
    ...state,
    version: 1,
    phase,
    playerOrderIds: Array.isArray(state.playerOrderIds) ? state.playerOrderIds : fallback.playerOrderIds,
    playerNameByPlayerId: {
      ...fallback.playerNameByPlayerId,
      ...(state.playerNameByPlayerId ?? {}),
    },
    playerAvatarKeyByPlayerId: {
      ...fallback.playerAvatarKeyByPlayerId,
      ...(state.playerAvatarKeyByPlayerId ?? {}),
    },
    roleByPlayerId: {
      ...fallback.roleByPlayerId,
      ...(state.roleByPlayerId ?? {}),
    },
    proposedQuestIndex:
      typeof state.proposedQuestIndex === "number" ? state.proposedQuestIndex : fallback.proposedQuestIndex,
    selectedTeamPlayerIds: Array.isArray(state.selectedTeamPlayerIds) ? state.selectedTeamPlayerIds : [],
    teamVotesByPlayerId: state.teamVotesByPlayerId ?? {},
    questCardsByPlayerId: state.questCardsByPlayerId ?? {},
    questResults: Array.isArray(state.questResults) ? state.questResults : [],
    questReveal: {
      questIndex: typeof rawQuestReveal.questIndex === "number" ? rawQuestReveal.questIndex : null,
      cards: questRevealCards,
      revealedCount:
        typeof rawQuestReveal.revealedCount === "number"
          ? Math.min(Math.max(0, rawQuestReveal.revealedCount), questRevealCards.length)
          : 0,
      result: rawQuestReveal.result ?? null,
    },
    phaseConfirmations: normalizeConfirmations(state.phaseConfirmations),
    options,
    ladyOfLake: {
      ...ladyOfLake,
      enabled: options.ladyOfLake,
    },
    assassination: {
      ...fallback.assassination,
      ...(state.assassination ?? {}),
    },
    winnerTeam: state.winnerTeam ?? null,
    winnerText: state.winnerText ?? null,
    winnerReason: state.winnerReason ?? null,
  };
}

async function loadAvalonGameState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  players: PlayerRow[]
) {
  const { data, error } = await supabase
    .from("avalon_game_states")
    .select("state, updated_at")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error || !data) {
    return {
      state: null,
      updatedAt: null,
      error,
    };
  }

  return {
    state: parseAvalonState(data.state, players),
    updatedAt: data.updated_at as string,
    error: null,
  };
}

async function updateAvalonState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  players: PlayerRow[],
  updater: (state: AvalonGameState) => AvalonGameState | { error: string }
): Promise<AvalonMutationResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { state, updatedAt, error } = await loadAvalonGameState(supabase, gameId, players);

    if (error || !state || !updatedAt) {
      return { ok: false, error: "Không thể đọc state Avalon." };
    }

    const updatedState = updater(state);

    if ("error" in updatedState) {
      return { ok: false, error: updatedState.error };
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("avalon_game_states")
      .update({ state: updatedState })
      .eq("game_id", gameId)
      .eq("updated_at", updatedAt)
      .select("game_id");

    if (updateError) {
      return { ok: false, error: "Không thể lưu state Avalon." };
    }

    if ((updatedRows ?? []).length > 0) {
      await syncSessionPhase(supabase, gameId, updatedState.phase);
      return { ok: true };
    }
  }

  return { ok: false, error: "State Avalon vừa thay đổi. Hãy thử lại." };
}

function buildInitialAvalonState(
  players: PlayerRow[],
  roles: AvalonRole[],
  input: Required<Pick<AvalonStartGameInput, "rolePreset" | "ladyOfLake">>
): AvalonGameState {
  const playerOrderIds = players.map((player) => player.id);
  const shuffledRoles = shuffleRoles(roles);
  const leaderIndex = Math.floor(Math.random() * players.length);
  const ladyHolderIndex = players.length > 0 ? (leaderIndex - 1 + players.length) % players.length : 0;
  const ladyHolderPlayerId = input.ladyOfLake ? playerOrderIds[ladyHolderIndex] ?? null : null;

  return {
    version: 1,
    phase: "role_reveal",
    playerOrderIds,
    playerNameByPlayerId: Object.fromEntries(players.map((player) => [player.id, player.name])),
    playerAvatarKeyByPlayerId: Object.fromEntries(
      players.map((player) => [player.id, normalizePlayerAvatarKey(player.avatar_key)])
    ),
    roleByPlayerId: Object.fromEntries(
      playerOrderIds.map((playerId, index) => [playerId, shuffledRoles[index]])
    ) as Record<string, AvalonRole>,
    leaderIndex,
    questIndex: 0,
    proposedQuestIndex: 0,
    proposalAttempt: 1,
    selectedTeamPlayerIds: [],
    teamVotesByPlayerId: {},
    questCardsByPlayerId: {},
    questResults: [],
    questReveal: createEmptyQuestReveal(),
    phaseConfirmations: {},
    options: {
      rolePreset: input.rolePreset,
      ladyOfLake: input.ladyOfLake,
      targeting: false,
    },
    ladyOfLake: {
      enabled: input.ladyOfLake,
      holderPlayerId: ladyHolderPlayerId,
      pendingAfterQuestIndex: null,
      usedByPlayerIds: ladyHolderPlayerId ? [ladyHolderPlayerId] : [],
      inspections: [],
    },
    assassination: {
      assassinPlayerId: playerOrderIds.find((playerId) => shuffledRoles[playerOrderIds.indexOf(playerId)] === "assassin") ?? null,
      targetPlayerId: null,
      guessedCorrect: null,
    },
    winnerTeam: null,
    winnerText: null,
    winnerReason: null,
  };
}

function buildRoleDeckSummary(state: AvalonGameState) {
  const roles = Object.values(state.roleByPlayerId);

  return AVALON_ROLE_ORDER.map((role) => ({
    role,
    count: roles.filter((selectedRole) => selectedRole === role).length,
  })).filter((summary) => summary.count > 0);
}

function buildPrivateInfo(state: AvalonGameState, currentPlayer: PlayerRow | null): AvalonPrivateInfo {
  if (!currentPlayer) {
    return {
      roleDescription: null,
      knownPlayers: [],
      ladyInspections: [],
    };
  }

  const myRole = state.roleByPlayerId[currentPlayer.id] ?? null;
  const knownPlayers: AvalonPrivateKnownPlayer[] = [];

  if (myRole === "merlin") {
    for (const playerId of state.playerOrderIds) {
      const role = state.roleByPlayerId[playerId];

      if (role && isAvalonEvilRole(role) && role !== "mordred") {
        knownPlayers.push({
          playerId,
          playerName: getPlayerNameFromState(state, playerId),
          role,
          loyalty: "evil",
          note: role === "oberon" ? "Evil, nhưng đồng đội không biết họ" : "Evil Merlin nhìn thấy",
        });
      }
    }
  }

  if (myRole === "percival") {
    for (const playerId of state.playerOrderIds) {
      const role = state.roleByPlayerId[playerId];

      if (role === "merlin" || role === "morgana") {
        knownPlayers.push({
          playerId,
          playerName: getPlayerNameFromState(state, playerId),
          role: null,
          loyalty: null,
          note: "",
        });
      }
    }
  }

  if (myRole && isAvalonEvilRole(myRole) && myRole !== "oberon") {
    for (const playerId of state.playerOrderIds) {
      const role = state.roleByPlayerId[playerId];

      if (role && isAvalonEvilRole(role) && role !== "oberon" && playerId !== currentPlayer.id) {
        knownPlayers.push({
          playerId,
          playerName: getPlayerNameFromState(state, playerId),
          role,
          loyalty: "evil",
          note: "Đồng đội Evil",
        });
      }
    }
  }

  const ladyInspections = state.ladyOfLake.inspections
    .filter((inspection) => inspection.holderPlayerId === currentPlayer.id)
    .map((inspection) => ({
      questNumber: inspection.questIndex + 1,
      targetPlayerId: inspection.targetPlayerId,
      targetName: getPlayerNameFromState(state, inspection.targetPlayerId),
      loyalty: inspection.loyalty,
    }));

  return {
    roleDescription: myRole ? AVALON_ROLE_DESCRIPTIONS[myRole] : null,
    knownPlayers,
    ladyInspections,
  };
}

function buildQuestResultSummary(state: AvalonGameState): AvalonQuestResultSummary[] {
  return state.questResults.map((result) => {
    const votes = Object.values(result.votesByPlayerId);

    return {
      ...result,
      questNumber: result.questIndex + 1,
      teamNames: result.teamPlayerIds.map((playerId) => getPlayerNameFromState(state, playerId)),
      leaderName: getPlayerNameFromState(state, result.leaderPlayerId),
      approveCount: votes.filter((vote) => vote === "approve").length,
      rejectCount: votes.filter((vote) => vote === "reject").length,
    };
  });
}

function buildAvalonPlayPlayers(
  state: AvalonGameState,
  livePlayers: PlayerRow[],
  currentPlayer: PlayerRow | null
): AvalonPlayPlayer[] {
  const confirmedRolePlayerIds = new Set(state.phaseConfirmations.role_reveal ?? []);
  const shouldRevealAllRoles = state.phase === "result";

  return state.playerOrderIds.map((playerId) => {
    const livePlayer = getLivePlayerById(livePlayers, playerId);
    const role = state.roleByPlayerId[playerId] ?? null;
    const teamVote = state.teamVotesByPlayerId[playerId] ?? null;
    const hasQuestSubmitted = Object.prototype.hasOwnProperty.call(state.questCardsByPlayerId, playerId);

    return {
      id: playerId,
      name: livePlayer?.name ?? state.playerNameByPlayerId[playerId] ?? "Người chơi đã rời",
      avatarKey: normalizePlayerAvatarKey(livePlayer?.avatar_key ?? state.playerAvatarKeyByPlayerId[playerId]),
      isHost: Boolean(livePlayer?.is_host),
      isReady: Boolean(livePlayer?.is_ready),
      joinedAt: livePlayer?.joined_at ?? "",
      role: shouldRevealAllRoles || currentPlayer?.id === playerId ? role : null,
      loyalty: shouldRevealAllRoles || currentPlayer?.id === playerId ? (role ? getAvalonRoleTeam(role) : null) : null,
      isOnQuestTeam: state.selectedTeamPlayerIds.includes(playerId),
      hasConfirmedRole: confirmedRolePlayerIds.has(playerId),
      hasTeamVoted: Boolean(teamVote),
      teamVote,
      hasQuestSubmitted,
    };
  });
}

function buildResult(state: AvalonGameState): AvalonPlayState["result"] {
  if (!state.winnerTeam || !state.winnerText || !state.winnerReason) {
    return null;
  }

  return {
    winnerTeam: state.winnerTeam,
    winnerText: state.winnerText,
    winnerReason: state.winnerReason,
  };
}

function canSkipLadyPhase(state: AvalonGameState) {
  if (!state.ladyOfLake.enabled || !state.ladyOfLake.holderPlayerId) {
    return true;
  }

  return state.playerOrderIds.every(
    (playerId) =>
      playerId === state.ladyOfLake.holderPlayerId ||
      state.ladyOfLake.usedByPlayerIds.includes(playerId)
  );
}

function advanceAfterQuest(state: AvalonGameState, questIndex: number): AvalonGameState {
  const counts = getQuestCounts(state);

  if (counts.fail >= 3) {
    return createResultState(
      state,
      "evil",
      "Evil thắng",
      "Ba quest đã thất bại trước khi Good hoàn thành đủ mục tiêu."
    );
  }

  if (counts.success >= 3) {
    return {
      ...state,
      phase: "assassination",
      selectedTeamPlayerIds: [],
      teamVotesByPlayerId: {},
      questCardsByPlayerId: {},
      questReveal: createEmptyQuestReveal(),
      ladyOfLake: {
        ...state.ladyOfLake,
        pendingAfterQuestIndex: null,
      },
    };
  }

  const shouldRunLady =
    state.ladyOfLake.enabled &&
    state.ladyOfLake.holderPlayerId &&
    questIndex >= 1 &&
    questIndex <= 3 &&
    !canSkipLadyPhase(state);

  if (shouldRunLady) {
    return {
      ...state,
      phase: "lady",
      selectedTeamPlayerIds: [],
      teamVotesByPlayerId: {},
      questCardsByPlayerId: {},
      questReveal: createEmptyQuestReveal(),
      ladyOfLake: {
        ...state.ladyOfLake,
        pendingAfterQuestIndex: questIndex,
      },
    };
  }

  return beginNextProposalState(state);
}

export async function listPublicAvalonRooms(): Promise<AvalonPublicRoomsResult> {
  const supabase = createSupabaseAdminClient();
  const { data: rooms, error: roomError } = await supabase
    .from("wolf_rooms")
    .select("id, code, host_player_id, updated_at")
    .eq("game_key", AVALON_GAME_KEY)
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

export async function createAvalonRoom(
  playerName?: string,
  avatarKey?: string,
  isPublic = true
): Promise<AvalonActionResult> {
  const sessionId = await getOrCreatePlayerSessionId();
  const supabase = createSupabaseAdminClient();
  const normalizedName = normalizePlayerName(playerName);
  const normalizedAvatarKey = normalizePlayerAvatarKey(avatarKey);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const roomCode = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("wolf_rooms")
      .insert({
        code: roomCode,
        game_key: AVALON_GAME_KEY,
        is_public: isPublic,
        status: "waiting",
      })
      .select("id, code")
      .single();

    if (roomError) {
      if (roomError.code === "23505") {
        continue;
      }

      const visibilityError = getRoomVisibilityErrorMessage(roomError);

      if (visibilityError) {
        return { ok: false, error: visibilityError };
      }

      return {
        ok: false,
        error:
          getDatabaseErrorMessage(roomError.code) ??
          "Không thể tạo phòng Avalon. Hãy kiểm tra database.",
      };
    }

    const { data: player, error: playerError } = await insertRoomPlayer(supabase, {
      room_id: room.id,
      session_id: sessionId,
      name: normalizedName,
      avatar_key: normalizedAvatarKey,
      is_host: true,
      is_ready: true,
    });

    if (playerError || !player) {
      return { ok: false, error: "Không thể tạo người chơi trong phòng Avalon." };
    }

    await supabase.from("wolf_rooms").update({ host_player_id: player.id }).eq("id", room.id);
    await safeBroadcastWolfRoomUpdate(room.code);

    return {
      ok: true,
      roomCode: room.code,
      playerId: player.id,
      playerName: normalizedName,
      playerAvatarKey: normalizedAvatarKey,
    };
  }

  return { ok: false, error: "Không thể tạo mã phòng Avalon duy nhất. Hãy thử lại." };
}

export async function joinAvalonRoom(
  roomCode: string,
  playerName?: string,
  avatarKey?: string
): Promise<AvalonActionResult> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
    return { ok: false, error: "Mã phòng phải gồm đúng 4 chữ cái." };
  }

  const sessionId = await getOrCreatePlayerSessionId();
  const { supabase, room, error } = await getRoomByCode(normalizedRoomCode);

  if (error) {
    return {
      ok: false,
      error:
        getDatabaseErrorMessage(error.code) ??
        "Không thể tìm phòng Avalon. Hãy kiểm tra database.",
    };
  }

  if (!room) {
    return { ok: false, error: "Không tìm thấy phòng Avalon." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng Avalon này đã bắt đầu." };
  }

  const players = await getActivePlayers(supabase, room);
  const normalizedName = normalizePlayerName(playerName);
  const normalizedAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const existingPlayer = players.find((player) => player.session_id === sessionId);

  if (existingPlayer) {
    const updateError = await updateRoomPlayerIdentity(
      supabase,
      existingPlayer.id,
      normalizedName,
      normalizedAvatarKey
    );

    if (updateError) {
      return { ok: false, error: "Không thể cập nhật tên hoặc avatar người chơi." };
    }

    await safeBroadcastWolfRoomUpdate(room.code);
    return {
      ok: true,
      roomCode: room.code,
      playerId: existingPlayer.id,
      playerName: normalizedName,
      playerAvatarKey: normalizedAvatarKey,
    };
  }

  if (players.length >= AVALON_MAX_PLAYERS) {
    return { ok: false, error: "Phòng Avalon đã đủ 10 người." };
  }

  const { data: player, error: playerError } = await insertRoomPlayer(supabase, {
    room_id: room.id,
    session_id: sessionId,
    name: normalizedName,
    avatar_key: normalizedAvatarKey,
    is_host: false,
    is_ready: false,
  });

  if (playerError || !player) {
    return { ok: false, error: "Không thể tham gia phòng Avalon." };
  }

  await safeBroadcastWolfRoomUpdate(room.code);
  return {
    ok: true,
    roomCode: room.code,
    playerId: player.id,
    playerName: normalizedName,
    playerAvatarKey: normalizedAvatarKey,
  };
}

export async function getAvalonLobbyState(roomCode: string): Promise<AvalonLobbyState | null> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id,
    },
    players: players.map(mapLobbyPlayer),
    currentPlayerId: currentPlayer?.id ?? null,
  };
}

export async function getAvalonSpectatorState(roomCode: string): Promise<AvalonSpectatorState | null> {
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  let game: AvalonSpectatorState["game"] = null;
  let result: AvalonPlayState["result"] = null;

  if (room.current_game_id) {
    const { state } = await loadAvalonGameState(supabase, room.current_game_id, players);

    if (state) {
      game = {
        phase: state.phase,
        phaseLabel: AVALON_PHASE_LABELS[state.phase],
      };
      result = buildResult(state);
    }
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id,
    },
    players: players.map(mapLobbyPlayer),
    game,
    result,
  };
}

export async function toggleAvalonReady(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy phòng Avalon." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng đã bắt đầu." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { error } = await supabase
    .from("wolf_room_players")
    .update({ is_ready: !currentPlayer.is_ready })
    .eq("id", currentPlayer.id);

  if (error) {
    return { ok: false, error: "Không thể cập nhật trạng thái sẵn sàng." };
  }

  await safeBroadcastWolfRoomUpdate(room.code);
  return { ok: true };
}

export async function kickAvalonPlayer(
  roomCode: string,
  targetPlayerId: string
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy phòng Avalon." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Không thể kick sau khi ván bắt đầu." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được kick người chơi." };
  }

  const targetPlayer = players.find((player) => player.id === targetPlayerId);

  if (!targetPlayer || targetPlayer.is_host || targetPlayer.id === currentPlayer?.id) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
  }

  const { error } = await supabase.from("wolf_room_players").delete().eq("id", targetPlayer.id);

  if (error) {
    return { ok: false, error: "Không thể kick người chơi." };
  }

  await safeBroadcastWolfRoomUpdate(room.code);
  return { ok: true };
}

export async function leaveAvalonRoom(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: true };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: true };
  }

  const remainingPlayers = players.filter((player) => player.id !== currentPlayer.id);
  const shouldTransferHost = isHost(currentPlayer, room) && remainingPlayers.length > 0;
  const nextHost = shouldTransferHost ? remainingPlayers[0] : null;

  await supabase.from("wolf_room_players").delete().eq("id", currentPlayer.id);

  if (nextHost) {
    await supabase.from("wolf_room_players").update({ is_host: true }).eq("id", nextHost.id);
    await supabase.from("wolf_rooms").update({ host_player_id: nextHost.id }).eq("id", room.id);
  }

  if (remainingPlayers.length === 0) {
    await supabase
      .from("wolf_rooms")
      .update({ status: "finished", host_player_id: null, current_game_id: null })
      .eq("id", room.id);
  }

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);
  return { ok: true };
}

export async function startAvalonGame(
  roomCode: string,
  input: AvalonStartGameInput = {}
): Promise<AvalonStartGameResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy phòng Avalon." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Phòng đã bắt đầu." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được bắt đầu." };
  }

  if (players.length < AVALON_MIN_PLAYERS || players.length > AVALON_MAX_PLAYERS) {
    return { ok: false, error: "Avalon cần từ 5 đến 10 người chơi." };
  }

  if (!players.every((player) => player.is_ready)) {
    return { ok: false, error: "Cần tất cả người chơi sẵn sàng." };
  }

  const rolePreset = input.rolePreset ?? "recommended";
  const deckValidation = validateAvalonDeck(players.length, input.selectedRoles, rolePreset);

  if (!deckValidation.ok) {
    return deckValidation;
  }

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
    return { ok: false, error: "Không thể tạo ván Avalon." };
  }

  const state = buildInitialAvalonState(players, deckValidation.roles, {
    rolePreset,
    ladyOfLake: Boolean(input.ladyOfLake),
  });

  const { error: stateError } = await supabase.from("avalon_game_states").insert({
    game_id: game.id,
    state,
  });

  if (stateError) {
    return {
      ok: false,
      error:
        getDatabaseErrorMessage(stateError.code) ??
        "Không thể lưu state Avalon. Cần chạy migration avalon_game_state.",
    };
  }

  await supabase
    .from("wolf_rooms")
    .update({ status: "playing", current_game_id: game.id })
    .eq("id", room.id);

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return {
    ok: true,
    roomCode: room.code,
    gameId: game.id,
  };
}

export async function getAvalonPlayState(roomCode: string): Promise<AvalonPlayState | null> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room?.current_game_id) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);
  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, room_id, phase, round_number, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData) {
    return null;
  }

  const game = gameData as GameRow;
  const { state, error } = await loadAvalonGameState(supabase, game.id, players);

  if (error || !state) {
    return null;
  }

  const myRole = currentPlayer ? state.roleByPlayerId[currentPlayer.id] ?? null : null;
  const myLoyalty = myRole ? getAvalonRoleTeam(myRole) : null;
  const questCounts = getQuestCounts(state);
  const availableQuestIndexes = getAvailableAvalonQuestIndexes(getCompletedQuestIndexes(state));
  const currentQuestIndex =
    state.phase === "team_proposal"
      ? availableQuestIndexes[0] ?? state.questIndex
      : state.proposedQuestIndex ?? state.questIndex;
  const requiredTeamSize = getAvalonQuestTeamSize(state.playerOrderIds.length, currentQuestIndex);
  const leaderPlayerId = getLeaderPlayerId(state);
  const teamVotes = Object.values(state.teamVotesByPlayerId);
  const isTeamVoteRevealed =
    state.phase !== "team_vote" || Object.keys(state.teamVotesByPlayerId).length >= state.playerOrderIds.length;

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id,
    },
    game: {
      id: game.id,
      phase: state.phase,
      phaseLabel: AVALON_PHASE_LABELS[state.phase],
      questIndex: state.questIndex,
      proposedQuestIndex: state.phase === "team_proposal" ? currentQuestIndex : state.proposedQuestIndex,
      proposalAttempt: state.proposalAttempt,
    },
    players: buildAvalonPlayPlayers(state, players, currentPlayer),
    currentPlayerId: currentPlayer?.id ?? null,
    isCurrentPlayerHost: isHost(currentPlayer, room),
    leaderPlayerId,
    leaderName: getPlayerNameFromState(state, leaderPlayerId),
    selectedTeamPlayerIds: state.selectedTeamPlayerIds,
    requiredTeamSize,
    availableQuestIndexes,
    questResults: buildQuestResultSummary(state),
    successCount: questCounts.success,
    failCount: questCounts.fail,
    myRole,
    myLoyalty,
    myTeamVote: currentPlayer ? state.teamVotesByPlayerId[currentPlayer.id] ?? null : null,
    myQuestCard: currentPlayer ? state.questCardsByPlayerId[currentPlayer.id] ?? null : null,
    privateInfo: buildPrivateInfo(state, currentPlayer),
    isTeamVoteRevealed,
    teamVoteCounts: {
      approve: teamVotes.filter((vote) => vote === "approve").length,
      reject: teamVotes.filter((vote) => vote === "reject").length,
    },
    questReveal: {
      questIndex: state.questReveal.questIndex,
      revealedCount: state.questReveal.revealedCount,
      totalCount: state.questReveal.cards.length,
      revealedCards: state.questReveal.cards.slice(0, state.questReveal.revealedCount),
      isComplete: state.questReveal.cards.length > 0 && state.questReveal.revealedCount >= state.questReveal.cards.length,
    },
    ladyOfLake: {
      enabled: state.ladyOfLake.enabled,
      holderPlayerId: state.ladyOfLake.holderPlayerId,
      holderName: getPlayerNameFromState(state, state.ladyOfLake.holderPlayerId),
      pendingAfterQuestIndex: state.ladyOfLake.pendingAfterQuestIndex,
      usedByPlayerIds: state.ladyOfLake.usedByPlayerIds,
    },
    assassination: state.assassination,
    result: buildResult(state),
    options: state.options,
    roleDeckSummary: buildRoleDeckSummary(state),
  };
}

export async function confirmAvalonRoleReveal(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "role_reveal") {
      return { error: "Đã qua bước xem vai." };
    }

    const confirmed = new Set(state.phaseConfirmations.role_reveal ?? []);
    confirmed.add(currentPlayer.id);
    const phaseConfirmations = {
      ...state.phaseConfirmations,
      role_reveal: [...confirmed],
    };

    if (confirmed.size >= state.playerOrderIds.length) {
      return {
        ...state,
        phase: "team_proposal",
        phaseConfirmations,
      };
    }

    return {
      ...state,
      phaseConfirmations,
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function proposeAvalonTeam(
  roomCode: string,
  input: { playerIds: string[]; questIndex?: number | null }
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "team_proposal") {
      return { error: "Chưa đến bước chọn đội." };
    }

    if (getLeaderPlayerId(state) !== currentPlayer.id) {
      return { error: "Chỉ Leader hiện tại mới được chọn đội." };
    }

    const availableQuestIndexes = getAvailableAvalonQuestIndexes(getCompletedQuestIndexes(state));
    const questIndex = availableQuestIndexes[0] ?? state.questIndex;

    if (!availableQuestIndexes.includes(questIndex)) {
      return { error: "Quest được chọn không hợp lệ." };
    }

    const requiredTeamSize = getAvalonQuestTeamSize(state.playerOrderIds.length, questIndex);
    const uniquePlayerIds = Array.from(new Set(input.playerIds));

    if (uniquePlayerIds.length !== requiredTeamSize) {
      return { error: `Quest ${questIndex + 1} cần đúng ${requiredTeamSize} người.` };
    }

    if (uniquePlayerIds.some((playerId) => !state.playerOrderIds.includes(playerId))) {
      return { error: "Đội được chọn có người chơi không hợp lệ." };
    }

    return {
      ...state,
      phase: "team_vote",
      proposedQuestIndex: questIndex,
      selectedTeamPlayerIds: uniquePlayerIds,
      teamVotesByPlayerId: {},
      questCardsByPlayerId: {},
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function updateAvalonTeamDraft(
  roomCode: string,
  input: { playerIds: string[]; questIndex?: number | null }
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "team_proposal") {
      return { error: "Chưa đến bước chọn đội." };
    }

    if (getLeaderPlayerId(state) !== currentPlayer.id) {
      return { error: "Chỉ Leader hiện tại mới được chọn đội." };
    }

    const availableQuestIndexes = getAvailableAvalonQuestIndexes(getCompletedQuestIndexes(state));
    const questIndex = availableQuestIndexes[0] ?? state.questIndex;

    if (!availableQuestIndexes.includes(questIndex)) {
      return { error: "Quest được chọn không hợp lệ." };
    }

    const requiredTeamSize = getAvalonQuestTeamSize(state.playerOrderIds.length, questIndex);
    const uniquePlayerIds = Array.from(new Set(input.playerIds));

    if (uniquePlayerIds.length > requiredTeamSize) {
      return { error: `Quest ${questIndex + 1} chỉ được chọn ${requiredTeamSize} người.` };
    }

    if (uniquePlayerIds.some((playerId) => !state.playerOrderIds.includes(playerId))) {
      return { error: "Đội đang chọn có người chơi không hợp lệ." };
    }

    return {
      ...state,
      proposedQuestIndex: questIndex,
      selectedTeamPlayerIds: uniquePlayerIds,
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function submitAvalonTeamVote(
  roomCode: string,
  vote: AvalonTeamVote
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  if (vote !== "approve" && vote !== "reject") {
    return { ok: false, error: "Phiếu vote không hợp lệ." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "team_vote") {
      return { error: "Chưa đến bước vote đội." };
    }

    if (state.teamVotesByPlayerId[currentPlayer.id]) {
      return { error: "Bạn đã vote đội này rồi." };
    }

    const nextVotes = {
      ...state.teamVotesByPlayerId,
      [currentPlayer.id]: vote,
    };

    return {
      ...state,
      teamVotesByPlayerId: nextVotes,
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function continueAvalonTeamVote(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "team_vote") {
      return { error: "Chưa đến bước vote đội." };
    }

    if (getLeaderPlayerId(state) !== currentPlayer.id) {
      return { error: "Chỉ Leader của đội đang đề cử mới được tiếp tục." };
    }

    if (Object.keys(state.teamVotesByPlayerId).length < state.playerOrderIds.length) {
      return { error: "Chưa đủ phiếu vote để tiếp tục." };
    }

    const approveCount = Object.values(state.teamVotesByPlayerId).filter((selectedVote) => selectedVote === "approve").length;
    const rejectCount = state.playerOrderIds.length - approveCount;
    const isApproved = approveCount > rejectCount;

    if (isApproved) {
      return {
        ...state,
        phase: "quest",
        questCardsByPlayerId: {},
      };
    }

    if (state.proposalAttempt >= 5) {
      return createResultState(
        {
          ...state,
        },
        "evil",
        "Evil thắng",
        "Năm đội liên tiếp bị reject trong cùng một quest."
      );
    }

    return {
      ...state,
      phase: "team_proposal",
      leaderIndex: getNextLeaderIndex(state),
      proposalAttempt: state.proposalAttempt + 1,
      selectedTeamPlayerIds: [],
      teamVotesByPlayerId: {},
      questCardsByPlayerId: {},
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function submitAvalonQuestCard(
  roomCode: string,
  card: AvalonQuestCard
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  if (card !== "success" && card !== "fail") {
    return { ok: false, error: "Lá quest không hợp lệ." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "quest") {
      return { error: "Chưa đến bước đi quest." };
    }

    if (!state.selectedTeamPlayerIds.includes(currentPlayer.id)) {
      return { error: "Chỉ người trong đội quest mới được chọn lá." };
    }

    if (state.questCardsByPlayerId[currentPlayer.id]) {
      return { error: "Bạn đã chọn lá quest rồi." };
    }

    const myRole = state.roleByPlayerId[currentPlayer.id];

    if (card === "fail" && (!myRole || getAvalonRoleTeam(myRole) === "good")) {
      return { error: "Phe Good bắt buộc phải đánh Success." };
    }

    const nextQuestCards = {
      ...state.questCardsByPlayerId,
      [currentPlayer.id]: card,
    };

    if (Object.keys(nextQuestCards).length < state.selectedTeamPlayerIds.length) {
      return {
        ...state,
        questCardsByPlayerId: nextQuestCards,
      };
    }

    const questIndex = state.proposedQuestIndex ?? state.questIndex;
    const failCount = Object.values(nextQuestCards).filter((selectedCard) => selectedCard === "fail").length;
    const requiredFails = getAvalonQuestRequiredFails(state.playerOrderIds.length, questIndex);
    const outcome: AvalonQuestOutcome = failCount >= requiredFails ? "fail" : "success";
    const questResult: AvalonQuestResult = {
      questIndex,
      teamPlayerIds: state.selectedTeamPlayerIds,
      failCount,
      requiredFails,
      outcome,
      leaderPlayerId: getLeaderPlayerId(state) ?? currentPlayer.id,
      proposalAttempt: state.proposalAttempt,
      votesByPlayerId: state.teamVotesByPlayerId,
    };

    return {
      ...state,
      phase: "quest_reveal",
      questIndex,
      questCardsByPlayerId: nextQuestCards,
      questReveal: {
        questIndex,
        cards: shuffleQuestCards(Object.values(nextQuestCards)),
        revealedCount: 0,
        result: questResult,
      },
    };
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function revealAvalonQuestCard(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "quest_reveal") {
      return { error: "Chưa đến bước mở bài quest." };
    }

    if (getLeaderPlayerId(state) !== currentPlayer.id) {
      return { error: "Chỉ Leader của quest mới được mở bài." };
    }

    if (state.questReveal.cards.length === 0 || !state.questReveal.result) {
      return { error: "Không tìm thấy bộ bài quest cần mở." };
    }

    if (state.questReveal.revealedCount < state.questReveal.cards.length) {
      return {
        ...state,
        questReveal: {
          ...state.questReveal,
          revealedCount: state.questReveal.revealedCount + 1,
        },
      };
    }

    const questIndex = state.questReveal.questIndex ?? state.proposedQuestIndex ?? state.questIndex;
    const nextState: AvalonGameState = {
      ...state,
      leaderIndex: getNextLeaderIndex(state),
      questIndex,
      questResults: [...state.questResults, state.questReveal.result],
      questReveal: createEmptyQuestReveal(),
    };

    return advanceAfterQuest(nextState, questIndex);
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function submitAvalonLadyTarget(
  roomCode: string,
  targetPlayerId: string
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "lady") {
      return { error: "Chưa đến bước Lady of the Lake." };
    }

    if (state.ladyOfLake.holderPlayerId !== currentPlayer.id) {
      return { error: "Chỉ người giữ Lady of the Lake mới được xem loyalty." };
    }

    if (!state.playerOrderIds.includes(targetPlayerId) || targetPlayerId === currentPlayer.id) {
      return { error: "Mục tiêu Lady of the Lake không hợp lệ." };
    }

    if (state.ladyOfLake.usedByPlayerIds.includes(targetPlayerId)) {
      return { error: "Không thể dùng Lady lên người từng giữ token Lady." };
    }

    const targetRole = state.roleByPlayerId[targetPlayerId];

    if (!targetRole) {
      return { error: "Không tìm thấy loyalty của mục tiêu." };
    }

    const nextState: AvalonGameState = {
      ...state,
      ladyOfLake: {
        ...state.ladyOfLake,
        holderPlayerId: targetPlayerId,
        pendingAfterQuestIndex: null,
        usedByPlayerIds: [...state.ladyOfLake.usedByPlayerIds, targetPlayerId],
        inspections: [
          ...state.ladyOfLake.inspections,
          {
            questIndex: state.ladyOfLake.pendingAfterQuestIndex ?? state.questIndex,
            holderPlayerId: currentPlayer.id,
            targetPlayerId,
            loyalty: getAvalonRoleTeam(targetRole),
          },
        ],
      },
    };

    return beginNextProposalState(nextState);
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function submitAvalonAssassination(
  roomCode: string,
  targetPlayerId: string
): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván Avalon." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const result = await updateAvalonState(supabase, room.current_game_id, players, (state) => {
    if (state.phase !== "assassination") {
      return { error: "Chưa đến bước Assassin đoán Merlin." };
    }

    const myRole = state.roleByPlayerId[currentPlayer.id];

    if (myRole !== "assassin") {
      return { error: "Chỉ Assassin mới được chốt mục tiêu Merlin." };
    }

    const targetRole = state.roleByPlayerId[targetPlayerId];

    if (!targetRole || getAvalonRoleTeam(targetRole) !== "good") {
      return { error: "Assassin phải chọn một người thuộc phe Good." };
    }

    const guessedCorrect = targetRole === "merlin";
    const nextState = {
      ...state,
      assassination: {
        assassinPlayerId: currentPlayer.id,
        targetPlayerId,
        guessedCorrect,
      },
    };

    return guessedCorrect
      ? createResultState(nextState, "evil", "Evil thắng", "Assassin đã đoán đúng Merlin.")
      : createResultState(nextState, "good", "Good thắng", "Assassin đoán sai Merlin sau 3 quest thành công.");
  });

  if (result.ok) {
    await safeBroadcastWolfPlayUpdate(room.code);
  }

  return result;
}

export async function finishAvalonGame(roomCode: string): Promise<AvalonMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy phòng Avalon." };
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
