"use server";

import { cookies } from "next/headers";
import { normalizePlayerAvatarKey } from "@/lib/player-avatars";
import { safeBroadcastWolfPlayUpdate, safeBroadcastWolfRoomUpdate } from "@/lib/pusher/server";
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
  is_host: boolean;
  is_ready: boolean;
  joined_at: string;
};

type ClassicWolfNightAction = {
  actionType: ClassicWolfRole;
  targetPlayerId: string | null;
  useHeal?: boolean;
};

type ClassicWolfDeathEvent = {
  roundNumber: number;
  phase: "night" | "day";
  playerIds: string[];
  reason: string;
};

type ClassicWolfNightRole = "guard" | "werewolf" | "seer" | "witch";

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
  nightAutoPassByNight: Record<string, Partial<Record<ClassicWolfNightRole, ClassicWolfNightAutoPassTurn>>>;
  votesByDay: Record<string, Record<string, string | null>>;
  phaseConfirmations: Record<string, string[]>;
  witchHealUsed: boolean;
  witchPoisonUsed: boolean;
  hunterShotByPlayerId: Record<string, string>;
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

function isMissingAvatarKeyError(error?: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (!error) {
    return false;
  }

  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`
    .toLowerCase()
    .includes("avatar_key");
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
    .select("id, room_id, session_id, name, avatar_key, is_host, is_ready, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  if (isMissingAvatarKeyError(error)) {
    const { data: playersWithoutAvatar } = await supabase
      .from("wolf_room_players")
      .select("id, room_id, session_id, name, is_host, is_ready, joined_at")
      .eq("room_id", room.id)
      .order("joined_at", { ascending: true });

    return ((playersWithoutAvatar ?? []) as PlayerRow[]).map((player) => ({
      ...player,
      avatar_key: undefined,
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
    is_host?: boolean;
    is_ready?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("wolf_room_players")
    .insert(values)
    .select("id")
    .single();

  if (!isMissingAvatarKeyError(error)) {
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

function mapLobbyPlayer(player: PlayerRow): ClassicWolfLobbyPlayer {
  return {
    id: player.id,
    name: player.name,
    avatarKey: normalizePlayerAvatarKey(player.avatar_key),
    isHost: player.is_host,
    isReady: player.is_ready,
    joinedAt: player.joined_at,
  };
}

function getCurrentPlayer(players: PlayerRow[], sessionId: string | null) {
  return players.find((player) => player.session_id === sessionId) ?? null;
}

function isHost(player: PlayerRow | null, room: RoomRow) {
  return Boolean(player && (player.is_host || player.id === room.host_player_id));
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
    nightAutoPassByNight: {},
    votesByDay: {},
    phaseConfirmations: {},
    witchHealUsed: false,
    witchPoisonUsed: false,
    hunterShotByPlayerId: {},
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
    nightAutoPassByNight: state.nightAutoPassByNight ?? {},
    votesByDay: state.votesByDay ?? {},
    phaseConfirmations: state.phaseConfirmations ?? {},
    hunterShotByPlayerId: state.hunterShotByPlayerId ?? {},
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

function chooseMostVotedTarget(targetPlayerIds: Array<string | null | undefined>) {
  const voteCounts = new Map<string, number>();

  for (const targetPlayerId of targetPlayerIds) {
    if (targetPlayerId) {
      voteCounts.set(targetPlayerId, (voteCounts.get(targetPlayerId) ?? 0) + 1);
    }
  }

  let selectedPlayerId: string | null = null;
  let selectedCount = 0;

  for (const [playerId, voteCount] of voteCounts) {
    if (voteCount > selectedCount) {
      selectedPlayerId = playerId;
      selectedCount = voteCount;
    }
  }

  return selectedPlayerId;
}

function getNightActions(state: ClassicWolfState, nightNumber: number) {
  return state.nightActionsByNight[String(nightNumber)] ?? {};
}

function getWolfAttackTargetForNight(state: ClassicWolfState, nightNumber: number) {
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

function getWolfAttackTarget(players: PlayerRow[], state: ClassicWolfState) {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};

  return chooseMostVotedTarget(
    getAlivePlayersByRole(players, state, "werewolf").map((player) => actions[player.id]?.targetPlayerId)
  );
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

        const topVoteCount = Math.max(0, ...voteCountByTarget.values());
        const topVotePlayerIds =
          topVoteCount > 0
            ? Array.from(voteCountByTarget.entries())
                .filter(([, voteCount]) => voteCount === topVoteCount)
                .map(([playerId]) => playerId)
            : [];
        const voteSummary =
          topVotePlayerIds.length > 0
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

function getActiveNightTurn(players: PlayerRow[], state: ClassicWolfState): ClassicWolfActiveNightTurn | null {
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};
  const witchVictimPlayerId = getWitchVictimPlayerId(players, state);
  const alivePlayerIds = new Set(state.alivePlayerIds);

  for (const role of ["guard", "werewolf", "seer", "witch"] satisfies ClassicWolfNightRole[]) {
    const rolePlayers = players.filter((player) => state.roleByPlayerId[player.id] === role);
    const aliveRolePlayers = rolePlayers.filter((player) => alivePlayerIds.has(player.id));
    const pendingPlayers = aliveRolePlayers.filter((player) => {
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
  const actions = state.nightActionsByNight[String(state.nightNumber)] ?? {};
  const witchVictimPlayerId = getWitchVictimPlayerId(players, state);
  const witchAction = getAlivePlayersByRole(players, state, "witch")
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

  const deathEvent: ClassicWolfDeathEvent = {
    roundNumber: state.nightNumber,
    phase: "night",
    playerIds: Array.from(deathPlayerIds),
    reason:
      deathPlayerIds.size > 0
        ? `Sau đêm ${state.nightNumber}, người chết đã được công bố.`
        : `Sau đêm ${state.nightNumber}, không ai chết.`,
  };

  return applyDeaths(players, { ...state, witchHealUsed, witchPoisonUsed }, deathEvent);
}

function resolveVote(players: PlayerRow[], state: ClassicWolfState) {
  const voteCounts = getVoteCounts(players, state);
  const maxVotes = Math.max(0, ...voteCounts.map((voteCount) => voteCount.votes));
  const eliminatedPlayerIds =
    maxVotes > 0
      ? voteCounts
          .filter((voteCount) => voteCount.votes === maxVotes)
          .map((voteCount) => voteCount.playerId)
      : [];
  const deathEvent: ClassicWolfDeathEvent = {
    roundNumber: state.dayNumber,
    phase: "day",
    playerIds: eliminatedPlayerIds,
    reason:
      eliminatedPlayerIds.length === 1
        ? `Sau ngày ${state.dayNumber}, ${getPlayerName(players, eliminatedPlayerIds[0], state)} nhận nhiều phiếu nhất (${maxVotes} phiếu) và bị treo cổ.`
        : eliminatedPlayerIds.length > 1
          ? `Sau ngày ${state.dayNumber}, ${eliminatedPlayerIds
              .map((playerId) => getPlayerName(players, playerId, state))
              .join(", ")} đồng hạng cao nhất (${maxVotes} phiếu) và bị treo cổ.`
        : `Sau ngày ${state.dayNumber}, không ai bị treo cổ.`,
  };

  return applyDeaths(players, state, deathEvent);
}

function getPendingHunterIds(players: PlayerRow[], state: ClassicWolfState) {
  const pendingDeathPlayerIds = state.pendingDeathEvent?.playerIds ?? [];

  return pendingDeathPlayerIds.filter(
    (playerId) =>
      state.roleByPlayerId[playerId] === "hunter" &&
      !state.alivePlayerIds.includes(playerId) &&
      !state.hunterShotByPlayerId[playerId] &&
      players.some((player) => player.id === playerId)
  );
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
    .select("state")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) {
    return { state: null, error };
  }

  return { state: parseClassicState(data?.state, players), error: null };
}

async function progressClassicNightAutoPassTurns(
  gameId: string,
  players: PlayerRow[],
  state: ClassicWolfState,
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  let nextState = state;
  let hasChanged = false;

  for (let index = 0; index < 4; index += 1) {
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

    if (getPendingHunterIds(players, state).length === 0 && readyPlayerIds.length >= alivePlayers.length) {
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

      await saveClassicGameState(
        game.id,
        nextState,
        {
          phase: "night_review",
          round_number: nextState.nightNumber,
          discussion_ends_at: null,
        },
        supabase
      );
    }
  }
}

export async function createClassicWolfRoom(
  playerName?: string,
  avatarKey?: string
): Promise<ClassicWolfActionResult> {
  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("wolf_rooms")
      .insert({ code, game_key: CLASSIC_WOLF_GAME_KEY })
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

    const { data: hostPlayer, error: playerError } = await insertWolfRoomPlayer(supabase, {
      room_id: room.id,
      session_id: sessionId,
      name,
      avatar_key: playerAvatarKey,
      is_host: true,
      is_ready: true,
    });

    if (playerError || !hostPlayer) {
      await supabase.from("wolf_rooms").delete().eq("id", room.id);
      return { ok: false, error: "Không thể thêm người chơi vào phòng." };
    }

    await supabase.from("wolf_rooms").update({ host_player_id: hostPlayer.id }).eq("id", room.id);
    await safeBroadcastWolfRoomUpdate(room.code);

    return {
      ok: true,
      roomCode: room.code,
      playerId: hostPlayer.id,
      playerName: name,
      playerAvatarKey,
    };
  }

  return { ok: false, error: "Không thể sinh mã phòng mới. Vui lòng thử lại." };
}

export async function joinClassicWolfRoom(
  roomCode: string,
  playerName?: string,
  avatarKey?: string
): Promise<ClassicWolfActionResult> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Mã phòng phải gồm đúng 4 chữ cái từ a đến z." };
  }

  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
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
    await supabase
      .from("wolf_room_players")
      .update({ name, avatar_key: playerAvatarKey })
      .eq("id", existingPlayer.id);
    await safeBroadcastWolfRoomUpdate(code);
    return {
      ok: true,
      roomCode: code,
      playerId: existingPlayer.id,
      playerName: name,
      playerAvatarKey,
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
    is_ready: false,
  });

  if (playerError || !player) {
    return { ok: false, error: "Không thể tham gia phòng." };
  }

  await safeBroadcastWolfRoomUpdate(code);

  return {
    ok: true,
    roomCode: code,
    playerId: player.id,
    playerName: name,
    playerAvatarKey,
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

  if (!player || player.is_host) {
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

  const unreadyPlayer = players.find((player) => !player.is_host && !player.is_ready);

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

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return null;
  }
  const alivePlayerIds = new Set(state.alivePlayerIds);
  const phaseReadyPlayerIds = getPhaseReadyPlayerIds(gameData.phase, state);
  const phaseReadyPlayerIdSet = new Set(phaseReadyPlayerIds);
  const dayVotes = state.votesByDay[String(state.dayNumber)] ?? {};
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

  if (!gameData || !["card_reveal", "night_review", "discussion"].includes(gameData.phase)) {
    return { ok: false, error: "Giai đoạn này không cần xác nhận." };
  }

  const { state: currentState, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !currentState) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  if (gameData.phase !== "card_reveal" && !currentState.alivePlayerIds.includes(currentPlayer.id)) {
    return { ok: false, error: "Người đã chết không thể thực hiện chức năng." };
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

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

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
  const nextActions = {
    ...(state.nightActionsByNight[nightKey] ?? {}),
    [currentPlayer.id]: {
      actionType: myRole,
      targetPlayerId: actionTargetPlayerId,
      useHeal: Boolean(input.useHeal),
    },
  };
  let nextState: ClassicWolfState = {
    ...state,
    nightActionsByNight: {
      ...state.nightActionsByNight,
      [nightKey]: nextActions,
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

  await saveClassicGameState(gameData.id, nextState, {}, supabase);
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

  const nextState = {
    ...state,
    votesByDay: {
      ...state.votesByDay,
      [dayKey]: {
        ...currentVotes,
        [currentPlayer.id]: targetPlayerId ?? null,
      },
    },
  };

  await saveClassicGameState(gameData.id, nextState, {}, supabase);
  await maybeAutoAdvancePhase(supabase, room, players, gameData, nextState);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function submitClassicWolfHunterShot(
  roomCode: string,
  targetPlayerId: string
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

  if (!gameData || gameData.phase !== "night_review") {
    return { ok: false, error: "Thợ Săn chỉ được bắn ở màn thông báo người chết." };
  }

  const { state, error: stateError } = await loadClassicGameState(supabase, gameData.id, players);

  if (stateError || !state) {
    return { ok: false, error: "Không thể đọc state Ma Sói nhiều đêm." };
  }

  const pendingHunterIds = getPendingHunterIds(players, state);

  if (!pendingHunterIds.includes(currentPlayer.id)) {
    return { ok: false, error: "Bạn không có lượt bắn Thợ Săn." };
  }

  if (!state.alivePlayerIds.includes(targetPlayerId) || targetPlayerId === currentPlayer.id) {
    return { ok: false, error: "Mục tiêu Thợ Săn không hợp lệ." };
  }

  const shotDeathEvent: ClassicWolfDeathEvent = {
    roundNumber: state.pendingDeathEvent?.roundNumber ?? state.nightNumber,
    phase: state.pendingDeathEvent?.phase ?? "night",
    playerIds: [targetPlayerId],
    reason: `${getPlayerName(players, currentPlayer.id)} là Thợ Săn và đã bắn ${getPlayerName(players, targetPlayerId)}.`,
  };
  const nextState = applyDeaths(players, {
    ...state,
    hunterShotByPlayerId: {
      ...state.hunterShotByPlayerId,
      [currentPlayer.id]: targetPlayerId,
    },
  }, shotDeathEvent);

  await saveClassicGameState(gameData.id, nextState, {}, supabase);
  await maybeAutoAdvancePhase(supabase, room, players, gameData, nextState);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
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
    .eq("room_id", room.id)
    .eq("is_host", false);
  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}
