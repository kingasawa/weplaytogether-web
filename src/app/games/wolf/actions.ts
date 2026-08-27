"use server";

import { cookies } from "next/headers";
import { safeBroadcastWolfPlayUpdate, safeBroadcastWolfRoomUpdate } from "@/lib/pusher/server";
import {
  getUploadedPlayerAvatarUrl,
  normalizePlayerAvatarKey,
  normalizePlayerAvatarObjectKey,
  normalizePlayerAvatarObjectKeyForSession,
} from "@/lib/player-avatars";
import { getLivePlayerProfilesByUserId, type LivePlayerProfile } from "@/lib/player-avatar-frames";
import {
  isMissingAvatarKeyColumnError,
  isMissingAvatarObjectKeyColumnError,
  isMissingUserIdColumnError,
} from "@/lib/supabase/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WolfGamePhase, WolfRole, WolfRoomStatus } from "@/lib/supabase/types";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";
import { WOLF_ROLE_LABELS } from "@/lib/wolf-game";

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const WOLF_GAME_KEY = "wolf";
const MAX_PLAYERS = 10;

const ROLE_DECK_ORDER: WolfRole[] = [
  "werewolf",
  "werewolf",
  "villager",
  "villager",
  "villager",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
  "drunk",
  "werewolf_seer",
  "witch",
  "doppelganger",
  "copycat",
];

// Theo bảng "Complete Wake Order" chính thức của Bezier Games (Copycat = -8, Doppelganger = -7),
// Copy Cat thức dậy TRƯỚC Nhân Bản: Copy Cat cần soi lá giữa bàn trước, để nếu lá đó chính là
// Nhân Bản thì có thể "chờ tới lượt" của Nhân Bản mà không bị lệch thứ tự.
const ROLE_RESOLUTION_ORDER: WolfRole[] = [
  "copycat",
  "doppelganger",
  "werewolf",
  "werewolf_seer",
  "seer",
  "robber",
  "witch",
  "drunk",
  "troublemaker",
  "insomniac",
  "villager",
];

const NIGHT_ACTION_ROLES = new Set<WolfRole>([
  "doppelganger",
  "copycat",
  "werewolf",
  "werewolf_seer",
  "seer",
  "robber",
  "witch",
  "drunk",
  "troublemaker",
  "insomniac",
]);

const VALID_WOLF_ROLES = new Set<WolfRole>(ROLE_DECK_ORDER);

const ROLE_SELECTION_LIMITS: Record<WolfRole, number> = {
  werewolf: 2,
  werewolf_seer: 1,
  villager: 3,
  seer: 1,
  robber: 1,
  troublemaker: 1,
  witch: 1,
  drunk: 1,
  insomniac: 1,
  doppelganger: 1,
  copycat: 1,
};

type RoomRow = {
  id: string;
  code: string;
  game_key?: string;
  is_public?: boolean;
  status: WolfRoomStatus;
  host_player_id: string | null;
  current_game_id?: string | null;
};

type PlayerRow = {
  id: string;
  room_id: string;
  session_id: string;
  name: string;
  avatar_key?: string | null;
  avatar_object_key?: string | null;
  user_id?: string | null;
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
  result_snapshot?: WolfResultSnapshot | null;
};

type CardRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  center_index: number | null;
  original_role: WolfRole;
  current_role: WolfRole;
};

type ActionRow = {
  id: string;
  game_id: string;
  player_id: string;
  action_type: string;
  target_player_id: string | null;
  target_player_id_2: string | null;
  target_player_id_3: string | null;
  target_center_index: number | null;
  target_center_index_2: number | null;
  target_center_index_3: number | null;
};

type VoteRow = {
  id: string;
  game_id: string;
  voter_player_id: string;
  target_player_id: string | null;
  is_skip?: boolean | null;
};

type PhaseConfirmationRow = {
  id: string;
  game_id: string;
  player_id: string;
  phase: WolfGamePhase;
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

type NightTurnConfirmationSet = Set<string>;

type NightTurnState = {
  playerId: string;
  playerName: string;
  originalRole: WolfRole;
  activeRole: WolfRole;
  copiedRole: WolfRole | null;
  isCopycatCopiedRole: boolean;
};

type DatabaseMutationError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type RoleDeckValidationResult =
  | {
      ok: true;
      roles: WolfRole[];
    }
  | {
      ok: false;
      error: string;
    };

export type WolfLobbyPlayer = {
  id: string;
  name: string;
  avatarKey: string;
  avatarObjectKey: string | null;
  avatarUrl: string | null;
  avatarFrameUrl: string | null;
  profileFrameUrl: string | null;
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
    currentGameId: string | null;
  };
  players: WolfLobbyPlayer[];
  currentPlayerId: string | null;
};

export type WolfSpectatorState = {
  room: WolfLobbyState["room"];
  players: WolfLobbyPlayer[];
  game: {
    phase: WolfGamePhase;
  } | null;
  result: WolfGameResult | null;
};

export type WolfActionResult =
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

export type WolfPublicRoomSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  updatedAt: string;
};

export type WolfPublicRoomsResult =
  | {
      ok: true;
      rooms: WolfPublicRoomSummary[];
    }
  | {
      ok: false;
      error: string;
    };

export type WolfStartGameResult =
  | {
      ok: true;
      roomCode: string;
      gameId: string;
    }
  | {
      ok: false;
      error: string;
    };

export type WolfMutationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type WolfCenterRevealResult =
  | {
      ok: true;
      centerIndex: number;
      role: WolfRole | null;
      isWerewolf: boolean | null;
      werewolfTeammates?: Array<{
        playerId: string;
        playerName: string;
      }>;
    }
  | {
      ok: false;
      error: string;
    };

export type WolfPlayerRevealResult =
  | {
      ok: true;
      playerId: string;
      playerName: string;
      role: WolfRole;
    }
  | {
      ok: false;
      error: string;
    };

export type WolfCenterCardState = {
  index: number;
  role: WolfRole | null;
  isWerewolf: boolean | null;
};

export type WolfPlayerRevealState = {
  playerId: string;
  playerName: string;
  role: WolfRole;
};

export type WolfPlayPlayer = WolfLobbyPlayer & {
  role: WolfRole | null;
  voteTargetPlayerId: string | null;
  hasSkippedVote: boolean;
  hasVoted: boolean;
  hasNightAction: boolean;
  isPhaseReady: boolean;
};

export type WolfGameResult = {
  eliminatedPlayerIds: string[];
  winnerTeam: "villagers" | "werewolves";
  winnerText: string;
  skippedVoteCount: number;
  voteCounts: Array<{
    playerId: string;
    votes: number;
  }>;
};

export type WolfCardMovementStep = {
  id: string;
  title: string;
  description: string;
  logText: string;
};

export type WolfCardMovementSummary = {
  orderText: string;
  steps: WolfCardMovementStep[];
};

export type WolfPlayerResultSummary = {
  playerId: string;
  playerName: string;
  originalRole: WolfRole;
  // Lá bài đang cầm lúc lật bài (Nhân Bản / Copy Cat vẫn hiển thị đúng tên của nó).
  finalRole: WolfRole;
  // Chức năng có hiệu lực để tính thắng/thua. Optional vì snapshot cũ chưa có trường này.
  finalTeamRole?: WolfRole;
};

type WolfResultSnapshot = {
  version: 1;
  createdAt: string;
  result: WolfGameResult;
  cardMovementSummary: WolfCardMovementSummary;
  allPlayersSummary: WolfPlayerResultSummary[];
  roleDeck: WolfRole[];
};

export type WolfPlayState = {
  room: WolfLobbyState["room"];
  game: {
    id: string;
    phase: WolfGamePhase;
    roundNumber: number;
    discussionEndsAt: string | null;
  };
  players: WolfPlayPlayer[];
  currentPlayerId: string | null;
  isCurrentPlayerHost: boolean;
  myCard: {
    originalRole: WolfRole;
    currentRole: WolfRole | null;
    nightReviewRole: WolfRole | null;
  } | null;
  werewolfTeammates: Array<{
    playerId: string;
    playerName: string;
  }>;
  centerCards: WolfCenterCardState[];
  playerReveals: WolfPlayerRevealState[];
  myAction: {
    actionType: string;
    targetPlayerId: string | null;
    targetPlayerId2: string | null;
    targetPlayerId3: string | null;
    targetCenterIndex: number | null;
    targetCenterIndex2: number | null;
    targetCenterIndex3: number | null;
  } | null;
  myVoteTargetPlayerId: string | null;
  activeNightTurn: NightTurnState | null;
  isCurrentNightTurnActionSubmitted: boolean;
  isNightTurnInProgress: boolean;
  isCurrentPlayerPhaseReady: boolean;
  phaseReadyPlayerIds: string[];
  nightReviewMessages: string[];
  nightReminder: {
    title: string;
    lines: string[];
  } | null;
  allNightActionsSubmitted: boolean;
  allVotesSubmitted: boolean;
  allPhaseConfirmationsSubmitted: boolean;
  result: WolfGameResult | null;
  cardMovementSummary: WolfCardMovementSummary | null;
  allPlayersSummary: WolfPlayerResultSummary[] | null;
  roleDeck: WolfRole[];
  // Điểm/Xu người chơi hiện tại vừa nhận từ ván này. null nếu chưa tới result hoặc là guest
  // (chưa đăng nhập, không được cộng điểm).
  myScoreReward: { points: number; coins: number } | null;
};

export type WolfNightActionInput = {
  actionType: string;
  targetPlayerId?: string | null;
  targetPlayerId2?: string | null;
  targetPlayerId3?: string | null;
  targetCenterIndex?: number | null;
  targetCenterIndex2?: number | null;
  targetCenterIndex3?: number | null;
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

// Avatar upload duoc gan voi session id. Khi session doi (cookie het han, bi xoa, doi
// trinh duyet/thiet bi), key cu con luu o localStorage khong con khop -> chi bo qua avatar
// va cho vao phong binh thuong, khong chan nguoi choi vao phong vi ly do nay.
function getUsableAvatarObjectKey(avatarObjectKey: string | null | undefined, sessionId: string) {
  return normalizePlayerAvatarObjectKeyForSession(avatarObjectKey, sessionId);
}

function shuffleRoles(roles: WolfRole[]) {
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

function validateSelectedRoleDeck(
  selectedRoles: WolfRole[] | undefined,
  requiredRoleCount: number
): RoleDeckValidationResult {
  if (!selectedRoles) {
    return { ok: true, roles: buildDefaultRoleDeck(requiredRoleCount) };
  }

  if (selectedRoles.length !== requiredRoleCount) {
    return {
      ok: false,
      error: `Cần chọn đúng ${requiredRoleCount} lá cho ${requiredRoleCount - 3} người chơi.`,
    };
  }

  if (selectedRoles.some((role) => !VALID_WOLF_ROLES.has(role))) {
    return { ok: false, error: "Danh sách role được chọn không hợp lệ." };
  }

  for (const role of VALID_WOLF_ROLES) {
    const selectedCount = selectedRoles.filter((selectedRole) => selectedRole === role).length;
    const roleLimit = ROLE_SELECTION_LIMITS[role];

    if (selectedCount > roleLimit) {
      return {
        ok: false,
        error: `${WOLF_ROLE_LABELS[role]} chỉ được chọn tối đa ${roleLimit} lá.`,
      };
    }
  }

  return { ok: true, roles: selectedRoles };
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
    .from("rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", normalizeRoomCode(roomCode))
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  return { supabase, room: room as RoomRow | null, error };
}

// room_players.user_id là cột mới (migration 202608250001), có thể chưa được apply thủ công
// trên remote. Thử select kèm user_id trước; nếu cột chưa tồn tại thì fallback về logic cũ và
// gán user_id = null cho mọi hàng (coi như toàn bộ người chơi là guest).
async function getActivePlayers(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  room: RoomRow
): Promise<PlayerRow[]> {
  const { data: players, error } = await supabase
    .from("room_players")
    .select(
      "id, room_id, session_id, name, avatar_key, avatar_object_key, user_id, is_host, is_ready, joined_at"
    )
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  if (!error) {
    return (players ?? []) as PlayerRow[];
  }

  if (isMissingUserIdColumnError(error)) {
    const legacyPlayers = await getActivePlayersWithoutUserId(supabase, room);
    return legacyPlayers.map((player) => ({ ...player, user_id: null }));
  }

  const legacyPlayers = await getActivePlayersWithoutUserId(supabase, room);
  const { data: userIdRows } = await supabase
    .from("room_players")
    .select("id, user_id")
    .eq("room_id", room.id);
  const userIdByPlayerId = new Map(
    (userIdRows ?? []).map((row) => [row.id as string, (row as { user_id: string | null }).user_id])
  );

  return legacyPlayers.map((player) => ({
    ...player,
    user_id: userIdByPlayerId.get(player.id) ?? null,
  }));
}

async function getActivePlayersWithoutUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  room: RoomRow
) {
  const { data: players, error } = await supabase
    .from("room_players")
    .select("id, room_id, session_id, name, avatar_key, avatar_object_key, is_host, is_ready, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  if (isMissingAvatarObjectKeyColumnError(error)) {
    const { data: playersWithoutAvatarObjectKey, error: avatarKeyError } = await supabase
      .from("room_players")
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
      .from("room_players")
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
      .from("room_players")
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
    user_id?: string | null;
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
    ...(values.user_id ? { user_id: values.user_id } : {}),
  };
  const { data, error } = await supabase
    .from("room_players")
    .insert(insertValues)
    .select("id")
    .single();

  if (values.user_id && isMissingUserIdColumnError(error)) {
    return insertWolfRoomPlayer(supabase, { ...values, user_id: undefined });
  }

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

  return supabase
    .from("room_players")
    .insert(fallbackValues)
    .select("id")
    .single();
}

async function updateWolfRoomPlayerIdentity(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string,
  name: string,
  avatarKey: string,
  avatarObjectKey: string | null,
  userId?: string | null
) {
  const updateValues = {
    name,
    avatar_key: avatarKey,
    avatar_object_key: avatarObjectKey,
    ...(userId ? { user_id: userId } : {}),
  };
  const { error } = await supabase
    .from("room_players")
    .update(updateValues)
    .eq("id", playerId);

  if (userId && isMissingUserIdColumnError(error)) {
    return updateWolfRoomPlayerIdentity(supabase, playerId, name, avatarKey, avatarObjectKey, null);
  }

  if (avatarObjectKey && isMissingAvatarObjectKeyColumnError(error)) {
    return error;
  }

  if (isMissingAvatarObjectKeyColumnError(error)) {
    const { error: fallbackError } = await supabase
      .from("room_players")
      .update({ name, avatar_key: avatarKey })
      .eq("id", playerId);

    return fallbackError;
  }

  if (!isMissingAvatarKeyColumnError(error)) {
    return error;
  }

  const { error: fallbackError } = await supabase
    .from("room_players")
    .update({ name })
    .eq("id", playerId);

  return fallbackError;
}

function mapLobbyPlayer(
  player: PlayerRow,
  liveProfilesByUserId?: Map<string, LivePlayerProfile>
): WolfLobbyPlayer {
  // Người chơi đã đăng nhập: ưu tiên tên/avatar "live" từ public.users thay vì bản snapshot
  // đã lưu ở room_players lúc join — để đổi tên/avatar trong Hồ sơ có hiệu lực ngay ở
  // mọi phòng, không cần vào lại phòng để "cập nhật" thủ công. Guest (không có user_id) luôn
  // dùng bản snapshot vì không có hàng nào trong users để tham chiếu.
  const liveProfile = player.user_id ? liveProfilesByUserId?.get(player.user_id) : undefined;
  const avatarObjectKey = normalizePlayerAvatarObjectKey(liveProfile?.avatarObjectKey ?? player.avatar_object_key);

  return {
    id: player.id,
    name: liveProfile?.displayName || player.name,
    avatarKey: normalizePlayerAvatarKey(liveProfile?.avatarKey ?? player.avatar_key),
    avatarObjectKey,
    avatarUrl: getUploadedPlayerAvatarUrl(avatarObjectKey),
    avatarFrameUrl: liveProfile?.avatarFrameUrl ?? null,
    profileFrameUrl: liveProfile?.profileFrameUrl ?? null,
    isHost: player.is_host,
    isReady: player.is_ready,
    joinedAt: player.joined_at,
  };
}

function mapPublicRoomSummaries(
  rooms: PublicRoomRow[],
  players: PublicRoomPlayerRow[]
): WolfPublicRoomSummary[] {
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

async function listPublicRoomsByGameKey(gameKey: string): Promise<WolfPublicRoomsResult> {
  const supabase = createSupabaseAdminClient();
  const { data: rooms, error: roomError } = await supabase
    .from("rooms")
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
    .from("room_players")
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

function getPlayerCard(cards: CardRow[], playerId: string) {
  return cards.find((card) => card.player_id === playerId) ?? null;
}

function getPlayerName(players: PlayerRow[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "không rõ";
}

function getRoleReviewLabel(role?: WolfRole | null) {
  return role ? WOLF_ROLE_LABELS[role] : "không rõ";
}

function getCardHolderLabel(card: CardRow | null, players: PlayerRow[]) {
  if (!card) {
    return "không rõ";
  }

  if (card.player_id) {
    return getPlayerName(players, card.player_id);
  }

  if (validateCenterIndex(card.center_index)) {
    return `lá giữa ${(card.center_index as number) + 1}`;
  }

  return "không rõ";
}

function getNightActionResolutionOrderText() {
  const nightActionRoles = ROLE_RESOLUTION_ORDER.filter((role) => NIGHT_ACTION_ROLES.has(role));

  return nightActionRoles
    .map((role, index) => `${index + 1}. ${WOLF_ROLE_LABELS[role]}`)
    .join(" → ");
}

function getCopiedRoleFromAction(cards: CardRow[], action: ActionRow | null) {
  if (!action || action.action_type !== "copycat" || !validateCenterIndex(action.target_center_index)) {
    return null;
  }

  return getCenterCard(cards, action.target_center_index as number)?.original_role ?? null;
}

function getDoppelgangerCopiedRole(cards: CardRow[], action: ActionRow | null) {
  if (!action || action.action_type !== "doppelganger" || !action.target_player_id) {
    return null;
  }

  return getPlayerCard(cards, action.target_player_id)?.original_role ?? null;
}

function getCenterIsWerewolf(cards: CardRow[], centerIndex: number | null) {
  if (!validateCenterIndex(centerIndex)) {
    return null;
  }

  const centerCard = getCenterCard(cards, centerIndex as number);

  return centerCard ? isWerewolfRole(centerCard.original_role) : null;
}

function getWolfCheckLabel(isWerewolf: boolean | null | undefined) {
  return isWerewolf ? "Sói" : "Không phải Sói";
}

function isSeerCenterSubmissionComplete(
  cards: CardRow[],
  firstCenterIndex: number | null,
  secondCenterIndex: number | null,
  excludedCenterIndex: number | null = null
) {
  if (
    !validateCenterIndex(firstCenterIndex) ||
    firstCenterIndex === excludedCenterIndex
  ) {
    return false;
  }

  if (getCenterIsWerewolf(cards, firstCenterIndex as number)) {
    return !validateCenterIndex(secondCenterIndex);
  }

  return Boolean(
    validateCenterIndex(secondCenterIndex) &&
      secondCenterIndex !== firstCenterIndex &&
      secondCenterIndex !== excludedCenterIndex
  );
}

function getSeerCenterIndexesForAction(
  cards: CardRow[],
  firstCenterIndex: number | null,
  secondCenterIndex: number | null,
  excludedCenterIndex: number | null = null
) {
  if (
    !validateCenterIndex(firstCenterIndex) ||
    firstCenterIndex === excludedCenterIndex
  ) {
    return [];
  }

  const firstIndex = firstCenterIndex as number;

  if (getCenterIsWerewolf(cards, firstIndex)) {
    return [firstIndex];
  }

  return validateCenterIndex(secondCenterIndex) &&
    secondCenterIndex !== firstCenterIndex &&
    secondCenterIndex !== excludedCenterIndex
    ? [firstIndex, secondCenterIndex as number]
    : [firstIndex];
}

function isDoppelgangerCopiedRoleComplete(copiedRole: WolfRole, action: ActionRow | null, cards: CardRow[]) {
  if (!action?.target_player_id) {
    return false;
  }

  if (
    copiedRole === "villager" ||
    copiedRole === "werewolf" ||
    copiedRole === "insomniac" ||
    copiedRole === "doppelganger" ||
    copiedRole === "copycat"
  ) {
    return true;
  }

  if (copiedRole === "seer") {
    return isSeerCenterSubmissionComplete(cards, action.target_center_index, action.target_center_index_2);
  }

  if (copiedRole === "werewolf_seer" || copiedRole === "robber") {
    return Boolean(action.target_player_id_2);
  }

  if (copiedRole === "troublemaker") {
    return Boolean(
      action.target_player_id_2 &&
        action.target_player_id_3 &&
        action.target_player_id_2 !== action.target_player_id_3
    );
  }

  if (copiedRole === "witch") {
    return validateCenterIndex(action.target_center_index) && Boolean(action.target_player_id_2);
  }

  if (copiedRole === "drunk") {
    return validateCenterIndex(action.target_center_index);
  }

  return true;
}

function getCopycatDoppelgangerCopiedRole(cards: CardRow[], action: ActionRow | null) {
  if (!action || action.action_type !== "copycat" || !validateCenterIndex(action.target_center_index)) {
    return null;
  }

  const copiedCenterCard = getCenterCard(cards, action.target_center_index as number);

  if (copiedCenterCard?.original_role !== "doppelganger" || !action.target_player_id) {
    return null;
  }

  return getPlayerCard(cards, action.target_player_id)?.original_role ?? null;
}

function isCopycatDoppelgangerActionComplete(action: ActionRow | null, cards: CardRow[]) {
  if (!action || !validateCenterIndex(action.target_center_index) || !action.target_player_id) {
    return false;
  }

  const copiedRole = getCopycatDoppelgangerCopiedRole(cards, action);

  if (!copiedRole) {
    return false;
  }

  if (
    copiedRole === "villager" ||
    copiedRole === "werewolf" ||
    copiedRole === "insomniac" ||
    copiedRole === "doppelganger" ||
    copiedRole === "copycat"
  ) {
    return true;
  }

  if (copiedRole === "seer") {
    return isSeerCenterSubmissionComplete(
      cards,
      action.target_center_index_2,
      action.target_center_index_3,
      action.target_center_index
    );
  }

  if (copiedRole === "werewolf_seer" || copiedRole === "robber") {
    return Boolean(action.target_player_id_2);
  }

  if (copiedRole === "troublemaker") {
    return Boolean(
      action.target_player_id_2 &&
        action.target_player_id_3 &&
        action.target_player_id_2 !== action.target_player_id_3
    );
  }

  if (copiedRole === "witch") {
    return validateCenterIndex(action.target_center_index_2) && Boolean(action.target_player_id_2);
  }

  if (copiedRole === "drunk") {
    return validateCenterIndex(action.target_center_index_2);
  }

  return true;
}

function isOriginalNightActionComplete(role: WolfRole, action: ActionRow | null, cards: CardRow[]) {
  if (!action) {
    return false;
  }

  if (role === "copycat") {
    return validateCenterIndex(action.target_center_index);
  }

  if (role === "villager" || role === "werewolf" || role === "insomniac") {
    return true;
  }

  if (role === "seer") {
    return isSeerCenterSubmissionComplete(cards, action.target_center_index, action.target_center_index_2);
  }

  if (role === "werewolf_seer" || role === "robber") {
    return Boolean(action.target_player_id);
  }

  if (role === "troublemaker") {
    return Boolean(
      action.target_player_id &&
        action.target_player_id_2 &&
        action.target_player_id !== action.target_player_id_2
    );
  }

  if (role === "witch") {
    return validateCenterIndex(action.target_center_index) && Boolean(action.target_player_id);
  }

  if (role === "drunk") {
    return validateCenterIndex(action.target_center_index);
  }

  return true;
}

function isCopycatCopiedRoleComplete(copiedRole: WolfRole, action: ActionRow | null, cards: CardRow[]) {
  if (!action || !validateCenterIndex(action.target_center_index)) {
    return false;
  }

  if (copiedRole === "doppelganger") {
    return isCopycatDoppelgangerActionComplete(action, cards);
  }

  if (copiedRole === "werewolf") {
    return Boolean(action.target_player_id_2) || validateCenterIndex(action.target_center_index_2);
  }

  if (copiedRole === "seer") {
    return isSeerCenterSubmissionComplete(
      cards,
      action.target_center_index_2,
      action.target_center_index_3,
      action.target_center_index
    );
  }

  if (copiedRole === "werewolf_seer" || copiedRole === "robber") {
    return Boolean(action.target_player_id);
  }

  if (copiedRole === "troublemaker") {
    return Boolean(
      action.target_player_id &&
        action.target_player_id_2 &&
        action.target_player_id !== action.target_player_id_2
    );
  }

  if (copiedRole === "witch") {
    return validateCenterIndex(action.target_center_index_2) && Boolean(action.target_player_id);
  }

  if (copiedRole === "drunk") {
    return validateCenterIndex(action.target_center_index_2);
  }

  return true;
}

function needsCopycatCopiedRoleTurn(copiedRole: WolfRole | null) {
  return Boolean(
      copiedRole &&
      copiedRole !== "copycat" &&
      copiedRole !== "villager" &&
      copiedRole !== "insomniac"
  );
}

function isNightTurnActionSubmitted(activeNightTurn: NightTurnState | null, action: ActionRow | null, cards: CardRow[]) {
  if (!activeNightTurn) {
    return false;
  }

  return activeNightTurn.isCopycatCopiedRole
    ? isCopycatCopiedRoleComplete(activeNightTurn.activeRole, action, cards)
    : activeNightTurn.activeRole === "doppelganger" && activeNightTurn.copiedRole
      ? isDoppelgangerCopiedRoleComplete(activeNightTurn.copiedRole, action, cards)
    : isOriginalNightActionComplete(activeNightTurn.activeRole, action, cards);
}

function doesNightTurnRequireResultConfirmation(
  activeNightTurn: NightTurnState,
  action: ActionRow | null,
  cards: CardRow[]
) {
  if (!isNightTurnActionSubmitted(activeNightTurn, action, cards)) {
    return false;
  }

  if (activeNightTurn.activeRole === "robber") {
    return true;
  }

  if (activeNightTurn.activeRole === "werewolf_seer") {
    return Boolean(action?.target_player_id);
  }

  if (activeNightTurn.activeRole === "doppelganger" && activeNightTurn.copiedRole) {
    if (activeNightTurn.copiedRole === "robber" || activeNightTurn.copiedRole === "insomniac") {
      return true;
    }

    if (activeNightTurn.copiedRole === "werewolf_seer") {
      return Boolean(action?.target_player_id_2);
    }
  }

  return false;
}

function getActiveNightTurn(
  players: PlayerRow[],
  cards: CardRow[],
  actions: ActionRow[],
  confirmedNightPlayerIds: NightTurnConfirmationSet = new Set()
) {
  const actionByPlayerId = new Map(actions.map((action) => [action.player_id, action]));
  const playerCardById = new Map(
    cards.filter((card) => card.player_id).map((card) => [card.player_id as string, card])
  );

  for (const role of ROLE_RESOLUTION_ORDER) {
    for (const player of players) {
      const card = playerCardById.get(player.id);

      if (!card) {
        continue;
      }

      const action = actionByPlayerId.get(player.id) ?? null;
      const isNightResultConfirmed = confirmedNightPlayerIds.has(player.id);

      if (card.original_role === "doppelganger") {
        const copiedRole = getDoppelgangerCopiedRole(cards, action);
        const isDoppelgangerComplete = copiedRole
          ? isDoppelgangerCopiedRoleComplete(copiedRole, action, cards)
          : false;

        if (!isDoppelgangerComplete || !isNightResultConfirmed) {
          return {
            playerId: player.id,
            playerName: player.name,
            originalRole: card.original_role,
            activeRole: "doppelganger" as const,
            copiedRole,
            isCopycatCopiedRole: false,
          };
        }
      }

      if (
        card.original_role === role &&
        card.original_role !== "doppelganger" &&
        (!isOriginalNightActionComplete(role, action, cards) || !isNightResultConfirmed)
      ) {
        return {
          playerId: player.id,
          playerName: player.name,
          originalRole: card.original_role,
          activeRole: role,
          copiedRole: null,
          isCopycatCopiedRole: false,
        };
      }

      if (card.original_role !== "copycat") {
        continue;
      }

      const copiedRole = getCopiedRoleFromAction(cards, action);
      const activeCopiedRole =
        copiedRole === "doppelganger" ? getCopycatDoppelgangerCopiedRole(cards, action) : copiedRole;

      if (
        copiedRole === role &&
        needsCopycatCopiedRoleTurn(copiedRole) &&
        (!isCopycatCopiedRoleComplete(copiedRole, action, cards) || !isNightResultConfirmed)
      ) {
        return {
          playerId: player.id,
          playerName: player.name,
          originalRole: card.original_role,
          activeRole: copiedRole,
          copiedRole: activeCopiedRole,
          isCopycatCopiedRole: true,
        };
      }
    }
  }

  return null;
}

function getCenterCard(cards: CardRow[], centerIndex: number) {
  return cards.find((card) => card.center_index === centerIndex) ?? null;
}

function validateCenterIndex(centerIndex?: number | null) {
  return typeof centerIndex === "number" && centerIndex >= 0 && centerIndex <= 2;
}

function isWerewolfRole(role?: WolfRole | null) {
  return role === "werewolf" || role === "werewolf_seer";
}

function getRoleByPlayerIdAfterCopycat(cards: CardRow[], actions: ActionRow[]) {
  const actionByPlayerId = new Map(actions.map((action) => [action.player_id, action]));
  const roleByPlayerId = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card.original_role])
  );

  for (const card of cards.filter((card) => card.player_id && card.original_role === "doppelganger")) {
    const action = actionByPlayerId.get(card.player_id as string);
    const copiedRole = getDoppelgangerCopiedRole(cards, action ?? null);

    if (copiedRole) {
      roleByPlayerId.set(card.player_id as string, copiedRole);
    }
  }

  for (const card of cards.filter((card) => card.player_id && card.original_role === "copycat")) {
    const action = actionByPlayerId.get(card.player_id as string);

    if (!action || !validateCenterIndex(action.target_center_index)) {
      continue;
    }

    const copiedCard = getCenterCard(cards, action.target_center_index as number);

    if (copiedCard?.original_role === "doppelganger") {
      roleByPlayerId.set(
        card.player_id as string,
        getCopycatDoppelgangerCopiedRole(cards, action) ?? copiedCard.original_role
      );
    } else if (copiedCard) {
      roleByPlayerId.set(card.player_id as string, copiedCard.original_role);
    }
  }

  return roleByPlayerId;
}

function getWerewolfPlayerIdsAfterCopycat(cards: CardRow[], actions: ActionRow[]) {
  return Array.from(getRoleByPlayerIdAfterCopycat(cards, actions).entries())
    .filter(([, role]) => isWerewolfRole(role))
    .map(([playerId]) => playerId);
}

function buildNightReviewMessages(
  currentPlayer: PlayerRow | null,
  action: ActionRow | null,
  cards: CardRow[],
  players: PlayerRow[],
  actions: ActionRow[] = action ? [action] : []
) {
  if (!currentPlayer) {
    return [];
  }

  if (!action) {
    return ["Bạn chưa gửi hành động ban đêm."];
  }

  if (action.action_type === "seer") {
    const centerIndexes = getSeerCenterIndexesForAction(
      cards,
      action.target_center_index,
      action.target_center_index_2
    );
    const revealedCards = centerIndexes.map((centerIndex) => {
      return `Lá giữa ${centerIndex + 1}: ${getWolfCheckLabel(getCenterIsWerewolf(cards, centerIndex))}`;
    });

    return revealedCards.length > 0 ? [`Bạn đã soi ${revealedCards.join(", ")}.`] : ["Bạn chưa chọn lá để soi."];
  }

  if (action.action_type === "werewolf_seer") {
    if (action.target_player_id) {
      const targetCard = getPlayerCard(cards, action.target_player_id);
      const messages = [
        `Bạn đã soi ${getPlayerName(players, action.target_player_id)}: ${getRoleReviewLabel(
          targetCard?.original_role
        )}.`,
      ];

      // Sói đơn được xem thêm một lá giữa bàn.
      if (validateCenterIndex(action.target_center_index)) {
        const centerCard = getCenterCard(cards, action.target_center_index as number);

        messages.push(
          `Bạn là Ma Sói duy nhất nên được xem lá giữa ${(action.target_center_index as number) + 1}: ${getRoleReviewLabel(
            centerCard?.original_role
          )}.`
        );
      }

      return messages;
    }

    return ["Sói Tiên Tri chưa chọn người chơi để soi."];
  }

  if (action.action_type === "werewolf") {
    const werewolfTeammateNames = getWerewolfPlayerIdsAfterCopycat(cards, actions)
      .filter((playerId) => playerId !== currentPlayer.id)
      .map((playerId) => getPlayerName(players, playerId));

    if (werewolfTeammateNames.length > 0) {
      return [`Bạn thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}. Vì có từ 2 Ma Sói trở lên, bạn không được xem lá giữa bàn.`];
    }

    if (validateCenterIndex(action.target_center_index)) {
      const centerCard = getCenterCard(cards, action.target_center_index as number);

      return [
        `Bạn đã xem lá giữa ${(action.target_center_index as number) + 1}: ${getRoleReviewLabel(
          centerCard?.original_role
        )}.`,
      ];
    }

    return ["Bạn đã hoàn tất lượt Ma Sói mà không xem lá giữa bàn."];
  }

  if (action.action_type === "robber") {
    const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
    const revealedRole = immediateRoleRevealByPlayerId.get(currentPlayer.id);

    return [
      `Bạn đã đổi bài với ${getPlayerName(players, action.target_player_id)}. Bài bạn nhận được lúc đổi là ${getRoleReviewLabel(
        revealedRole
      )}.`,
    ];
  }

  if (action.action_type === "troublemaker") {
    return [
      `Bạn đã đổi bài của ${getPlayerName(players, action.target_player_id)} và ${getPlayerName(
        players,
        action.target_player_id_2
      )}. Bạn không được xem hai lá đó.`,
    ];
  }

  if (action.action_type === "witch") {
    return [
      validateCenterIndex(action.target_center_index) && action.target_player_id
        ? `Bạn đã mở lá giữa ${(action.target_center_index as number) + 1} và đổi lá đó với ${getPlayerName(
            players,
            action.target_player_id
          )}.`
        : "Bạn chưa chọn đủ lá giữa và người nhận cho Phù Thuỷ.",
    ];
  }

  if (action.action_type === "drunk") {
    return [
      validateCenterIndex(action.target_center_index)
        ? `Bạn đã đổi bài với lá giữa ${(action.target_center_index as number) + 1}. Bạn không được xem lá mới.`
        : "Bạn đã hoàn tất lượt Say Rượu.",
    ];
  }

  if (action.action_type === "insomniac") {
    const myCard = getPlayerCard(cards, currentPlayer.id);
    const { currentRoleByCardId } = simulateNightResolution(cards, actions, players);

    return [
      `Sau ban đêm, bài hiện tại của bạn là ${getRoleReviewLabel(
        myCard ? currentRoleByCardId.get(myCard.id) ?? myCard.current_role : null
      )}.`,
    ];
  }

  if (action.action_type === "copycat") {
    if (!validateCenterIndex(action.target_center_index)) {
      return ["Copy Cat chưa chọn lá giữa để copy."];
    }

    const copiedCard = getCenterCard(cards, action.target_center_index as number);
    const copiedRole = copiedCard ? getRoleReviewLabel(copiedCard.original_role) : "không rõ";

    if (copiedCard?.original_role === "werewolf") {
      const werewolfTeammateNames = getWerewolfPlayerIdsAfterCopycat(cards, actions)
        .filter((playerId) => playerId !== currentPlayer.id)
        .map((playerId) => getPlayerName(players, playerId));

      return [
        werewolfTeammateNames.length > 0
          ? `Bạn đã copy lá giữa ${(action.target_center_index as number) + 1}: ${copiedRole}. Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}.`
          : `Bạn đã copy lá giữa ${(action.target_center_index as number) + 1}: ${copiedRole}. Bạn không thấy Ma Sói cùng phe.`,
      ];
    }

    if (copiedCard?.original_role === "seer") {
      const centerIndexes = getSeerCenterIndexesForAction(
        cards,
        action.target_center_index_2,
        action.target_center_index_3,
        action.target_center_index
      );
      const revealedCards = centerIndexes.map((centerIndex) => {
        return `Lá giữa ${centerIndex + 1}: ${getWolfCheckLabel(getCenterIsWerewolf(cards, centerIndex))}`;
      });

      return [
        `Bạn đã copy lá giữa ${(action.target_center_index as number) + 1}: ${copiedRole}. Bạn đã soi ${revealedCards.join(", ")}.`,
      ];
    }

    if (copiedCard?.original_role === "robber" && action.target_player_id) {
      const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
      const revealedRole = immediateRoleRevealByPlayerId.get(currentPlayer.id);

      return [
        `Bạn đã copy lá giữa ${(action.target_center_index as number) + 1}: ${copiedRole}. Bài bạn nhận được lúc đổi là ${getRoleReviewLabel(
          revealedRole
        )}.`,
      ];
    }

    return [`Bạn đã copy lá giữa ${(action.target_center_index as number) + 1}: ${copiedRole}.`];
  }

  if (action.action_type === "doppelganger") {
    const copiedRole = getDoppelgangerCopiedRole(cards, action);

    if (!copiedRole) {
      return ["Nhân Bản chưa chọn người chơi để copy."];
    }

    if (copiedRole === "robber" && action.target_player_id_2) {
      const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
      const revealedRole = immediateRoleRevealByPlayerId.get(currentPlayer.id);

      return [
        `Bạn đã nhân bản ${getPlayerName(players, action.target_player_id)} (${getRoleReviewLabel(
          copiedRole
        )}) và đổi bài với ${getPlayerName(players, action.target_player_id_2)}. Bài bạn nhận được lúc đổi là ${getRoleReviewLabel(
          revealedRole
        )}.`,
      ];
    }

    if (copiedRole === "seer") {
      const centerIndexes = getSeerCenterIndexesForAction(
        cards,
        action.target_center_index,
        action.target_center_index_2
      );
      const revealedCards = centerIndexes.map((centerIndex) => {
        return `Lá giữa ${centerIndex + 1}: ${getWolfCheckLabel(getCenterIsWerewolf(cards, centerIndex))}`;
      });

      return [
        `Bạn đã nhân bản ${getPlayerName(players, action.target_player_id)} (${getRoleReviewLabel(
          copiedRole
        )}) và soi ${revealedCards.join(", ")}.`,
      ];
    }

    if (copiedRole === "werewolf_seer" && action.target_player_id_2) {
      const targetCard = getPlayerCard(cards, action.target_player_id_2);
      const messages = [
        `Bạn đã nhân bản ${getPlayerName(players, action.target_player_id)} (${getRoleReviewLabel(
          copiedRole
        )}) và soi ${getPlayerName(players, action.target_player_id_2)}: ${getRoleReviewLabel(
          targetCard?.original_role
        )}.`,
      ];

      if (validateCenterIndex(action.target_center_index)) {
        const centerCard = getCenterCard(cards, action.target_center_index as number);

        messages.push(
          `Bạn là Ma Sói duy nhất nên được xem lá giữa ${(action.target_center_index as number) + 1}: ${getRoleReviewLabel(
            centerCard?.original_role
          )}.`
        );
      }

      return messages;
    }

    return [
      `Bạn đã nhân bản ${getPlayerName(players, action.target_player_id)}: ${getRoleReviewLabel(
        copiedRole
      )}.`,
    ];
  }

  return ["Vai trò của bạn không có quyền xem thêm kết quả ban đêm."];
}

function buildWolfNightReminder(
  currentPlayer: PlayerRow | null,
  action: ActionRow | null,
  cards: CardRow[],
  players: PlayerRow[],
  actions: ActionRow[]
): WolfPlayState["nightReminder"] {
  if (!currentPlayer) {
    return null;
  }

  const myCard = getPlayerCard(cards, currentPlayer.id);
  const originalRole = myCard?.original_role ?? null;

  if (!originalRole) {
    return null;
  }

  if (!NIGHT_ACTION_ROLES.has(originalRole)) {
    return {
      title: `${WOLF_ROLE_LABELS[originalRole]} trong đêm`,
      lines: [`Bạn là ${WOLF_ROLE_LABELS[originalRole]}. Vai này không có hành động ban đêm.`],
    };
  }

  return {
    title: `${WOLF_ROLE_LABELS[originalRole]} trong đêm`,
    lines: buildNightReviewMessages(currentPlayer, action, cards, players, actions),
  };
}

function getNightReviewRole(
  currentPlayer: PlayerRow | null,
  action: ActionRow | null,
  cards: CardRow[],
  players: PlayerRow[],
  actions: ActionRow[]
) {
  if (!currentPlayer || !action) {
    return null;
  }

  if (action.action_type === "insomniac") {
    const myCard = getPlayerCard(cards, currentPlayer.id);
    const { currentRoleByCardId } = simulateNightResolution(cards, actions, players);

    return myCard ? currentRoleByCardId.get(myCard.id) ?? myCard.current_role : null;
  }

  if (action.action_type === "robber") {
    const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
    return immediateRoleRevealByPlayerId.get(currentPlayer.id) ?? null;
  }

  if (action.action_type === "copycat" && validateCenterIndex(action.target_center_index)) {
    const copiedCard = getCenterCard(cards, action.target_center_index as number);

    if (copiedCard?.original_role === "robber") {
      const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
      return immediateRoleRevealByPlayerId.get(currentPlayer.id) ?? null;
    }

    if (copiedCard?.original_role === "doppelganger") {
      const copiedRole = getCopycatDoppelgangerCopiedRole(cards, action);

      if (copiedRole === "robber") {
        const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
        return immediateRoleRevealByPlayerId.get(currentPlayer.id) ?? null;
      }

      if (copiedRole === "insomniac") {
        return getInsomniacCurrentRole(currentPlayer, cards, actions, players);
      }
    }
  }

  if (action.action_type === "doppelganger") {
    const copiedRole = getDoppelgangerCopiedRole(cards, action);

    if (copiedRole === "robber") {
      const { immediateRoleRevealByPlayerId } = simulateNightResolution(cards, actions, players);
      return immediateRoleRevealByPlayerId.get(currentPlayer.id) ?? null;
    }

    if (copiedRole === "insomniac") {
      return getInsomniacCurrentRole(currentPlayer, cards, actions, players);
    }
  }

  return null;
}

function getInsomniacCurrentRole(currentPlayer: PlayerRow | null, cards: CardRow[], actions: ActionRow[], players: PlayerRow[]) {
  if (!currentPlayer) {
    return null;
  }

  const myCard = getPlayerCard(cards, currentPlayer.id);
  const { currentRoleByCardId } = simulateNightResolution(cards, actions, players);

  return myCard ? currentRoleByCardId.get(myCard.id) ?? myCard.current_role : null;
}

function buildPlayerReveals(
  currentPlayer: PlayerRow | null,
  action: ActionRow | null,
  cards: CardRow[],
  players: PlayerRow[]
): WolfPlayerRevealState[] {
  if (!currentPlayer || !action?.target_player_id) {
    return [];
  }

  if (action.action_type === "doppelganger") {
    const copiedRole = getDoppelgangerCopiedRole(cards, action);
    const clonedCard = getPlayerCard(cards, action.target_player_id);
    const reveals: WolfPlayerRevealState[] = clonedCard?.player_id
      ? [
          {
            playerId: clonedCard.player_id,
            playerName: getPlayerName(players, clonedCard.player_id),
            role: clonedCard.original_role,
          },
        ]
      : [];

    if (
      copiedRole === "werewolf_seer" &&
      action.target_player_id_2
    ) {
      const targetCard = getPlayerCard(cards, action.target_player_id_2);

      if (targetCard?.player_id) {
        reveals.push({
          playerId: targetCard.player_id,
          playerName: getPlayerName(players, targetCard.player_id),
          role: targetCard.original_role,
        });
      }
    }

    return reveals;
  }

  if (action.action_type === "copycat" && validateCenterIndex(action.target_center_index)) {
    const copiedCard = getCenterCard(cards, action.target_center_index as number);

    if (copiedCard?.original_role === "doppelganger") {
      const copiedRole = getCopycatDoppelgangerCopiedRole(cards, action);
      const clonedCard = action.target_player_id ? getPlayerCard(cards, action.target_player_id) : null;
      const reveals: WolfPlayerRevealState[] = clonedCard?.player_id
        ? [
            {
              playerId: clonedCard.player_id,
              playerName: getPlayerName(players, clonedCard.player_id),
              role: clonedCard.original_role,
            },
          ]
        : [];

      if (copiedRole === "werewolf_seer" && action.target_player_id_2) {
        const targetCard = getPlayerCard(cards, action.target_player_id_2);

        if (targetCard?.player_id) {
          reveals.push({
            playerId: targetCard.player_id,
            playerName: getPlayerName(players, targetCard.player_id),
            role: targetCard.original_role,
          });
        }
      }

      return reveals;
    }
  }

  let shouldRevealTargetRole = action.action_type === "werewolf_seer";

  if (action.action_type === "copycat" && validateCenterIndex(action.target_center_index)) {
    const copiedCard = getCenterCard(cards, action.target_center_index as number);
    shouldRevealTargetRole = copiedCard?.original_role === "werewolf_seer";
  }

  if (!shouldRevealTargetRole) {
    return [];
  }

  const targetCard = getPlayerCard(cards, action.target_player_id);

  if (!targetCard?.player_id) {
    return [];
  }

  return [
    {
      playerId: targetCard.player_id,
      playerName: getPlayerName(players, targetCard.player_id),
      role: targetCard.original_role,
    },
  ];
}

function isConfirmablePhase(phase: WolfGamePhase) {
  return phase === "card_reveal" || phase === "night" || phase === "night_review" || phase === "discussion";
}

async function getPhaseConfirmations(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  phase: WolfGamePhase
) {
  const { data } = await supabase
    .from("game_phase_confirmations")
    .select("id, game_id, player_id, phase")
    .eq("game_id", gameId)
    .eq("phase", phase);

  return (data ?? []) as PhaseConfirmationRow[];
}

const WOLF_GAME_SELECT = "id, room_id, phase, round_number, discussion_ends_at";
const WOLF_GAME_SELECT_WITH_RESULT_SNAPSHOT = `${WOLF_GAME_SELECT}, result_snapshot`;

function isMissingResultSnapshotColumnError(error?: DatabaseMutationError | null) {
  if (!error) {
    return false;
  }

  const message = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ");

  return message.includes("result_snapshot");
}

function parseWolfResultSnapshot(value: unknown): WolfResultSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const snapshot = value as Partial<WolfResultSnapshot>;

  if (
    snapshot.version !== 1 ||
    !snapshot.result ||
    !snapshot.cardMovementSummary ||
    !Array.isArray(snapshot.allPlayersSummary) ||
    !Array.isArray(snapshot.roleDeck)
  ) {
    return null;
  }

  return snapshot as WolfResultSnapshot;
}

async function getWolfGameRowById(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string
) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select(WOLF_GAME_SELECT_WITH_RESULT_SNAPSHOT)
    .eq("id", gameId)
    .maybeSingle();

  if (!error) {
    if (!data) {
      return null;
    }

    return {
      ...(data as GameRow),
      result_snapshot: parseWolfResultSnapshot((data as { result_snapshot?: unknown }).result_snapshot),
    };
  }

  if (!isMissingResultSnapshotColumnError(error)) {
    return null;
  }

  const { data: fallbackData } = await supabase
    .from("game_sessions")
    .select(WOLF_GAME_SELECT)
    .eq("id", gameId)
    .maybeSingle();

  return (fallbackData ?? null) as GameRow | null;
}

async function maybeAutoAdvancePhase(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  room: RoomRow,
  players: PlayerRow[],
  phase: WolfGamePhase
) {
  if (!room.current_game_id) {
    return;
  }

  if (phase === "card_reveal") {
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, phase);

    if (confirmations.length >= players.length) {
      await supabase
        .from("game_sessions")
        .update({ phase: "night" })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "night") {
    const { data: actionsData } = await supabase
      .from("game_actions")
      .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
      .eq("game_id", room.current_game_id);
    const { data: cardsData } = await supabase
      .from("game_cards")
      .select("id, game_id, player_id, center_index, original_role, current_role")
      .eq("game_id", room.current_game_id);
    const actions = (actionsData ?? []) as ActionRow[];
    const cards = (cardsData ?? []) as CardRow[];
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, "night");
    const confirmedNightPlayerIds = new Set(confirmations.map((confirmation) => confirmation.player_id));

    if (!getActiveNightTurn(players, cards, actions, confirmedNightPlayerIds)) {
      await resolveNightActions(room.current_game_id);
      await supabase
        .from("game_sessions")
        .update({
          phase: "discussion",
          discussion_ends_at: null,
        })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "night_review") {
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, phase);

    if (confirmations.length >= players.length) {
      await supabase
        .from("game_sessions")
        .update({
          phase: "discussion",
          discussion_ends_at: null,
        })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "discussion") {
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, phase);

    if (confirmations.length >= players.length) {
      await supabase
        .from("game_sessions")
        .update({ phase: "voting" })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "voting") {
    const { data: votesData } = await supabase
      .from("game_votes")
      .select("voter_player_id")
      .eq("game_id", room.current_game_id);
    const votePlayerIds = new Set((votesData ?? []).map((vote) => vote.voter_player_id));

    if (players.every((player) => votePlayerIds.has(player.id))) {
      await setWolfGameResultPhase(supabase, room.current_game_id, room.code, players);
    }
  }
}

function buildGameResult(
  players: PlayerRow[],
  cards: CardRow[],
  votes: VoteRow[],
  effectiveRoleByCardId?: Map<string, WolfRole>
): WolfGameResult {
  const activePlayerIds = new Set(players.map((player) => player.id));
  const voteMap = new Map<string, number>();

  for (const player of players) {
    voteMap.set(player.id, 0);
  }

  for (const vote of votes) {
    if (vote.target_player_id && activePlayerIds.has(vote.target_player_id)) {
      voteMap.set(vote.target_player_id, (voteMap.get(vote.target_player_id) ?? 0) + 1);
    }
  }

  const voteCounts = Array.from(voteMap.entries()).map(([playerId, voteCount]) => ({
    playerId,
    votes: voteCount,
  }));
  const maxVotes = Math.max(0, ...voteCounts.map((voteCount) => voteCount.votes));
  const skippedVoteCount = votes.filter((vote) => vote.is_skip || !vote.target_player_id).length;
  const eliminatedPlayerIds =
    maxVotes > 0
      ? voteCounts
          .filter((voteCount) => voteCount.votes === maxVotes)
          .map((voteCount) => voteCount.playerId)
      : [];
  const finalRoleByPlayerId = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [
        card.player_id as string,
        effectiveRoleByCardId?.get(card.id) ?? card.current_role,
      ])
  );
  const werewolfPlayerIds = players
    .filter((player) => isWerewolfRole(finalRoleByPlayerId.get(player.id)))
    .map((player) => player.id);
  const eliminatedWerewolf = eliminatedPlayerIds.some(
    (playerId) => isWerewolfRole(finalRoleByPlayerId.get(playerId))
  );

  if (werewolfPlayerIds.length === 0) {
    const villagersWin = eliminatedPlayerIds.length === 0;
    return {
      eliminatedPlayerIds,
      winnerTeam: villagersWin ? "villagers" : "werewolves",
      winnerText: villagersWin
        ? "Không có Ma Sói và không ai bị treo. Dân làng thắng."
        : "Không có Ma Sói nhưng có người bị treo. Dân làng thua.",
      skippedVoteCount,
      voteCounts,
    };
  }

  return {
    eliminatedPlayerIds,
    winnerTeam: eliminatedWerewolf ? "villagers" : "werewolves",
    winnerText: eliminatedWerewolf
      ? "Có Ma Sói bị treo. Dân làng thắng."
      : "Không có Ma Sói nào bị treo. Ma Sói thắng.",
    skippedVoteCount,
    voteCounts,
  };
}

type WolfNightResolution = {
  currentRoleByCardId: Map<string, WolfRole>;
  effectiveRoleByCardId: Map<string, WolfRole>;
  cardMovementSummary: WolfCardMovementSummary;
  immediateRoleRevealByPlayerId: Map<string, WolfRole>;
};

const EMPTY_PLAYERS: PlayerRow[] = [];

// Mô phỏng đêm là phần tốn CPU nhất của mỗi request, mà nó đang bị gọi lại hơn 10 lần với
// cùng một bộ dữ liệu (getNightReviewRole, getInsomniacCurrentRole, buildNightReviewMessages...).
// Hàm thuần tuý nên cache được theo đúng tham số của request. Dùng WeakMap khoá theo mảng cards
// để không giữ rác giữa các request: mỗi request fetch ra mảng mới.
const nightResolutionCache = new WeakMap<
  CardRow[],
  { actions: ActionRow[]; players: PlayerRow[]; resolution: WolfNightResolution }
>();

function simulateNightResolution(
  cards: CardRow[],
  actions: ActionRow[],
  players: PlayerRow[] = EMPTY_PLAYERS
): WolfNightResolution {
  const cached = nightResolutionCache.get(cards);

  if (cached && cached.actions === actions && cached.players === players) {
    return cached.resolution;
  }

  const resolution = computeNightResolution(cards, actions, players);
  nightResolutionCache.set(cards, { actions, players, resolution });

  return resolution;
}

// Không gọi trực tiếp hàm này: dùng simulateNightResolution() để hưởng cache.
function computeNightResolution(
  cards: CardRow[],
  actions: ActionRow[],
  players: PlayerRow[]
): WolfNightResolution {
  const actionByPlayerId = new Map(actions.map((action) => [action.player_id, action]));
  // Danh tính lá bài vật lý: chỉ đổi chỗ qua swapCards, không bao giờ bị ghi đè.
  const currentRoleByCardId = new Map(cards.map((card) => [card.id, card.original_role]));
  // Chức năng mà lá Nhân Bản / Copy Cat "dính" theo mình. Lá vẫn hiển thị là Nhân Bản / Copy Cat,
  // nhưng ai cầm nó lúc lật bài sẽ thắng/thua theo chức năng này.
  const attachedRoleByCardId = new Map<string, WolfRole>();
  // Vai để xác định ai thức dậy trong lượt nào: role gốc + role mà Nhân Bản/Copycat đã copy.
  // Không phụ thuộc lá bài đã bị đổi chỗ trong đêm (giống hệt logic lúc chơi thật).
  const wakingRoleByPlayerId = getRoleByPlayerIdAfterCopycat(cards, actions);
  const immediateRoleRevealByPlayerId = new Map<string, WolfRole>();
  const copiedRoleByCopycatPlayerId = new Map<string, WolfRole>();
  const steps: WolfCardMovementStep[] = [];
  let stepNumber = 1;

  const roleOfCard = (card: CardRow) => currentRoleByCardId.get(card.id) ?? card.original_role;
  const attachRole = (card: CardRow | null, nextRole: WolfRole) => {
    if (!card) {
      return;
    }

    attachedRoleByCardId.set(card.id, nextRole);
  };
  const swapCards = (cardA: CardRow | null, cardB: CardRow | null) => {
    if (!cardA || !cardB) {
      return;
    }

    const roleA = roleOfCard(cardA);
    currentRoleByCardId.set(cardA.id, roleOfCard(cardB));
    currentRoleByCardId.set(cardB.id, roleA);

    // Chức năng đã copy đi theo lá bài.
    const attachedA = attachedRoleByCardId.get(cardA.id);
    const attachedB = attachedRoleByCardId.get(cardB.id);

    if (attachedB === undefined) {
      attachedRoleByCardId.delete(cardA.id);
    } else {
      attachedRoleByCardId.set(cardA.id, attachedB);
    }

    if (attachedA === undefined) {
      attachedRoleByCardId.delete(cardB.id);
    } else {
      attachedRoleByCardId.set(cardB.id, attachedA);
    }
  };

  for (const role of ROLE_RESOLUTION_ORDER) {
    const roleCards = cards.filter(
      (card) =>
        card.player_id &&
        (card.original_role === role ||
          (card.original_role === "copycat" &&
            copiedRoleByCopycatPlayerId.get(card.player_id as string) === role))
    );

    for (const card of roleCards) {
      const action = actionByPlayerId.get(card.player_id as string);

      if (!action) {
        continue;
      }

      const isCopycatCopiedRoleAction = card.original_role === "copycat" && role !== "copycat";
      const actorRoleLabel = isCopycatCopiedRoleAction
        ? `${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS[role]}`
        : WOLF_ROLE_LABELS[role];
      const getActionTitle = (actorName: string) =>
        isCopycatCopiedRoleAction
          ? `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[role]}`
          : `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`;
      const primaryCenterIndex = isCopycatCopiedRoleAction
        ? action.target_center_index_2
        : action.target_center_index;
      const secondaryCenterIndex = isCopycatCopiedRoleAction
        ? action.target_center_index_3
        : action.target_center_index_2;

      if (role === "doppelganger" && action.target_player_id) {
        const actorName = getPlayerName(players, card.player_id);
        const copiedRole = getDoppelgangerCopiedRole(cards, action);
        const copiedTargetName = getPlayerName(players, action.target_player_id);

        if (!copiedRole) {
          continue;
        }

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) nhân bản ${copiedTargetName} (${getRoleReviewLabel(copiedRole)})`,
          description: `${actorName} xem chức năng của ${copiedTargetName}, trở thành ${getRoleReviewLabel(copiedRole)} và thực hiện chức năng đó ngay trong lượt Nhân Bản.`,
        });
        stepNumber += 1;
        attachRole(card, copiedRole);

        const copiedPrimaryTargetId = action.target_player_id_2;
        const copiedSecondaryTargetId = action.target_player_id_3;

        if (copiedRole === "robber" && copiedPrimaryTargetId) {
          const targetCard = getPlayerCard(cards, copiedPrimaryTargetId);

          if (targetCard) {
            const targetName = getCardHolderLabel(targetCard, players);
            const targetRoleBefore = roleOfCard(targetCard);
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.robber}) đổi bài với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
              description: `${actorName} nhân bản Kẻ Trộm và đổi bài với ${targetName}.`,
            });
            stepNumber += 1;
            immediateRoleRevealByPlayerId.set(card.player_id as string, targetRoleBefore);
            swapCards(card, targetCard);
          }
        }

        if (copiedRole === "troublemaker" && copiedPrimaryTargetId && copiedSecondaryTargetId) {
          const firstTargetCard = getPlayerCard(cards, copiedPrimaryTargetId);
          const secondTargetCard = getPlayerCard(cards, copiedSecondaryTargetId);

          if (firstTargetCard && secondTargetCard) {
            const firstTargetName = getCardHolderLabel(firstTargetCard, players);
            const secondTargetName = getCardHolderLabel(secondTargetCard, players);
            const firstRoleBefore = roleOfCard(firstTargetCard);
            const secondRoleBefore = roleOfCard(secondTargetCard);

            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.troublemaker}) đổi bài của ${firstTargetName} (${getRoleReviewLabel(firstRoleBefore)}) với ${secondTargetName} (${getRoleReviewLabel(secondRoleBefore)})`,
              description: `${actorName} nhân bản Kẻ Gây Rối và đổi chỗ hai lá này ngay trong lượt Nhân Bản.`,
            });
            stepNumber += 1;
            swapCards(firstTargetCard, secondTargetCard);
          }
        }

        if (copiedRole === "witch" && validateCenterIndex(action.target_center_index) && copiedPrimaryTargetId) {
          const centerCard = getCenterCard(cards, action.target_center_index as number);
          const targetCard = getPlayerCard(cards, copiedPrimaryTargetId);

          if (centerCard && targetCard) {
            const centerLabel = getCardHolderLabel(centerCard, players);
            const targetName = getCardHolderLabel(targetCard, players);
            const centerRoleBefore = roleOfCard(centerCard);
            const targetRoleBefore = roleOfCard(targetCard);

            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.witch}) đổi ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)}) với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
              description: `${actorName} nhân bản Phù Thuỷ, mở ${centerLabel} rồi đổi lá đó với ${targetName}. Sau khi đổi, ${targetName} nhận ${getRoleReviewLabel(centerRoleBefore)}, còn ${centerLabel} nhận ${getRoleReviewLabel(targetRoleBefore)}.`,
            });
            stepNumber += 1;
            swapCards(centerCard, targetCard);
          }
        }

        if (copiedRole === "drunk" && validateCenterIndex(action.target_center_index)) {
          const centerCard = getCenterCard(cards, action.target_center_index as number);

          if (centerCard) {
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.drunk}) đổi bài với ${getCardHolderLabel(centerCard, players)}`,
              description: `${actorName} nhân bản Say Rượu và đổi bài với lá giữa đã chọn nhưng không xem lá mới.`,
            });
            stepNumber += 1;
            swapCards(card, centerCard);
          }
        }

        if (copiedRole === "insomniac") {
          const currentRole = roleOfCard(card);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.insomniac}) xem bài hiện tại: ${getRoleReviewLabel(currentRole)}`,
            description: `${actorName} nhân bản Mất Ngủ và biết lá mình đang giữ ngay trong lượt Nhân Bản.`,
          });
          stepNumber += 1;
        }

        if (copiedRole === "werewolf") {
          const werewolfTeammateNames = cards
            .filter(
              (possibleTeammateCard) =>
                possibleTeammateCard.player_id &&
                possibleTeammateCard.player_id !== card.player_id &&
                isWerewolfRole(wakingRoleByPlayerId.get(possibleTeammateCard.player_id as string))
            )
            .map((possibleTeammateCard) => getPlayerName(players, possibleTeammateCard.player_id));

          if (werewolfTeammateNames.length > 0) {
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf}) thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}`,
              description: `${actorName} nhân bản Ma Sói nên thức dậy cùng bầy sói và biết đồng đội của mình.`,
            });
          } else if (validateCenterIndex(action.target_center_index)) {
            const centerCard = getCenterCard(cards, action.target_center_index as number);

            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(roleOfCard(centerCard as CardRow))})`,
              description: `${actorName} nhân bản Ma Sói và là sói đơn nên được xem một lá giữa bàn. Hành động này không làm đổi vị trí lá bài.`,
            });
          } else {
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf}) hoàn tất lượt mà không xem lá giữa bàn`,
              description: `${actorName} nhân bản Ma Sói nhưng không có đồng đội và không chọn xem lá giữa bàn.`,
            });
          }

          stepNumber += 1;
        }

        if (copiedRole === "werewolf_seer" && copiedPrimaryTargetId) {
          const targetCard = getPlayerCard(cards, copiedPrimaryTargetId);
          const targetName = getPlayerName(players, copiedPrimaryTargetId);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf_seer}) soi ${targetName} (${getRoleReviewLabel(targetCard ? roleOfCard(targetCard) : null)})`,
            description: `${actorName} nhân bản Sói Tiên Tri và soi lá của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
          });
          stepNumber += 1;

          if (validateCenterIndex(action.target_center_index)) {
            const centerCard = getCenterCard(cards, action.target_center_index as number);

            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf_seer}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard ? roleOfCard(centerCard) : null)})`,
              description: `${actorName} là sói đơn nên được xem thêm một lá giữa bàn.`,
            });
            stepNumber += 1;
          }
        }

        if (copiedRole === "seer") {
          const centerIndexes = getSeerCenterIndexesForAction(
            cards,
            action.target_center_index,
            action.target_center_index_2
          );
          const revealedCenters = centerIndexes.map((centerIndex) => {
            const centerCard = getCenterCard(cards, centerIndex);

            return `${getCardHolderLabel(centerCard, players)} (${getWolfCheckLabel(
              centerCard ? isWerewolfRole(roleOfCard(centerCard)) : null
            )})`;
          });

          if (revealedCenters.length > 0) {
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.seer}) soi ${revealedCenters.join(" và ")}`,
              description: `${actorName} nhân bản Tiên Tri và kiểm tra các lá giữa đã chọn. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
            });
            stepNumber += 1;
          }
        }

        continue;
      }

      if (role === "werewolf") {
        const actorName = getPlayerName(players, card.player_id);
        const werewolfTeammateNames = cards
          .filter(
            (possibleTeammateCard) =>
              possibleTeammateCard.player_id &&
              possibleTeammateCard.player_id !== card.player_id &&
              isWerewolfRole(wakingRoleByPlayerId.get(possibleTeammateCard.player_id as string))
          )
          .map((possibleTeammateCard) => getPlayerName(players, possibleTeammateCard.player_id));

        if (werewolfTeammateNames.length > 0) {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}`,
            description: `${actorName} có đồng đội Ma Sói nên không xem lá giữa bàn trong lượt này.`,
          });
          stepNumber += 1;
        } else if (validateCenterIndex(primaryCenterIndex)) {
          const centerCard = getCenterCard(cards, primaryCenterIndex as number);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard?.original_role)})`,
            description: `${actorName} là Ma Sói đơn nên được xem một lá giữa bàn. Hành động này không làm đổi vị trí lá bài.`,
          });
          stepNumber += 1;
        } else {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) hoàn tất lượt mà không xem lá giữa bàn`,
            description: `${actorName} không chọn xem lá giữa bàn trong lượt Ma Sói. Hành động này không làm đổi vị trí lá bài.`,
          });
          stepNumber += 1;
        }
      }

      if (role === "werewolf_seer" && action.target_player_id) {
        const actorName = getPlayerName(players, card.player_id);
        const targetCard = getPlayerCard(cards, action.target_player_id);
        const targetName = getPlayerName(players, action.target_player_id);
        const werewolfTeammateNames = cards
          .filter(
            (possibleTeammateCard) =>
              possibleTeammateCard.player_id &&
              possibleTeammateCard.player_id !== card.player_id &&
              isWerewolfRole(wakingRoleByPlayerId.get(possibleTeammateCard.player_id as string))
          )
          .map((possibleTeammateCard) => getPlayerName(players, possibleTeammateCard.player_id));

        // Sói Tiên Tri thức dậy cùng bầy sói trước: thấy đồng đội, hoặc nếu là sói đơn thì
        // được xem một lá giữa bàn.
        if (werewolfTeammateNames.length > 0) {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}`,
            description: `${actorName} thức dậy cùng bầy sói nên biết đồng đội của mình.`,
          });
          stepNumber += 1;
        } else if (validateCenterIndex(primaryCenterIndex)) {
          const centerCard = getCenterCard(cards, primaryCenterIndex as number);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard ? roleOfCard(centerCard) : null)})`,
            description: `${actorName} là sói đơn nên được xem thêm một lá giữa bàn. Hành động này không làm đổi vị trí lá bài.`,
          });
          stepNumber += 1;
        }

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) soi ${targetName} (${getRoleReviewLabel(targetCard?.original_role)})`,
          description: `${actorName} xem bài ban đầu của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
        });
        stepNumber += 1;
      }

      if (role === "seer") {
        const actorName = getPlayerName(players, card.player_id);
        const centerIndexes = getSeerCenterIndexesForAction(cards, primaryCenterIndex, secondaryCenterIndex);
        const revealedCenters = centerIndexes.map((centerIndex) => {
          const centerCard = getCenterCard(cards, centerIndex);

          return `${getCardHolderLabel(centerCard, players)} (${getWolfCheckLabel(getCenterIsWerewolf(cards, centerIndex))})`;
        });

        if (revealedCenters.length > 0) {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${actorRoleLabel}) soi ${revealedCenters.join(" và ")}`,
            description: `${actorName} kiểm tra các lá giữa đã chọn là Sói hay không phải Sói. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
          });
          stepNumber += 1;
        }
      }

      if (role === "copycat" && validateCenterIndex(action.target_center_index)) {
        const copiedCenterCard = getCenterCard(cards, action.target_center_index as number);

        if (!copiedCenterCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const copiedRole = copiedCenterCard.original_role;

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) copy ${WOLF_ROLE_LABELS[copiedRole]} từ ${getCardHolderLabel(copiedCenterCard, players)}`,
          description: `${actorName} chọn ${getCardHolderLabel(copiedCenterCard, players)}, nhận chức năng ${WOLF_ROLE_LABELS[copiedRole]}, rồi thực hiện chức năng đó theo đúng lượt trong đêm.`,
        });
        stepNumber += 1;
        copiedRoleByCopycatPlayerId.set(card.player_id as string, copiedRole);
        attachRole(card, copiedRole);

        if (copiedRole === "doppelganger" && action.target_player_id) {
          const nestedCopiedRole = getCopycatDoppelgangerCopiedRole(cards, action);
          const copiedTargetName = getPlayerName(players, action.target_player_id);

          if (!nestedCopiedRole) {
            continue;
          }

          steps.push({
            id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
            title: getActionTitle(actorName),
            logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger}) nhân bản ${copiedTargetName} (${getRoleReviewLabel(nestedCopiedRole)})`,
            description: `${actorName} copy ${WOLF_ROLE_LABELS.doppelganger}, chọn ${copiedTargetName}, rồi thực hiện chức năng như ${WOLF_ROLE_LABELS.doppelganger} bình thường.`,
          });
          stepNumber += 1;
          attachRole(card, nestedCopiedRole);

          const nestedPrimaryTargetId = action.target_player_id_2;
          const nestedSecondaryTargetId = action.target_player_id_3;
          const nestedPrimaryCenterIndex = action.target_center_index_2;

          if (nestedCopiedRole === "robber" && nestedPrimaryTargetId) {
            const targetCard = getPlayerCard(cards, nestedPrimaryTargetId);

            if (targetCard) {
              const targetName = getCardHolderLabel(targetCard, players);
              const targetRoleBefore = roleOfCard(targetCard);
              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.robber}) đổi bài với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
                description: `${actorName} thực hiện chức năng ${WOLF_ROLE_LABELS.robber} sau khi copy ${WOLF_ROLE_LABELS.doppelganger}.`,
              });
              stepNumber += 1;
              immediateRoleRevealByPlayerId.set(card.player_id as string, targetRoleBefore);
              swapCards(card, targetCard);
            }
          }

          if (nestedCopiedRole === "troublemaker" && nestedPrimaryTargetId && nestedSecondaryTargetId) {
            const firstTargetCard = getPlayerCard(cards, nestedPrimaryTargetId);
            const secondTargetCard = getPlayerCard(cards, nestedSecondaryTargetId);

            if (firstTargetCard && secondTargetCard) {
              const firstTargetName = getCardHolderLabel(firstTargetCard, players);
              const secondTargetName = getCardHolderLabel(secondTargetCard, players);
              const firstRoleBefore = roleOfCard(firstTargetCard);
              const secondRoleBefore = roleOfCard(secondTargetCard);

              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.troublemaker}) đổi bài của ${firstTargetName} (${getRoleReviewLabel(firstRoleBefore)}) với ${secondTargetName} (${getRoleReviewLabel(secondRoleBefore)})`,
                description: `${actorName} thực hiện chức năng ${WOLF_ROLE_LABELS.troublemaker} sau khi copy ${WOLF_ROLE_LABELS.doppelganger}.`,
              });
              stepNumber += 1;
              swapCards(firstTargetCard, secondTargetCard);
            }
          }

          if (nestedCopiedRole === "witch" && validateCenterIndex(nestedPrimaryCenterIndex) && nestedPrimaryTargetId) {
            const centerCard = getCenterCard(cards, nestedPrimaryCenterIndex as number);
            const targetCard = getPlayerCard(cards, nestedPrimaryTargetId);

            if (centerCard && targetCard) {
              const centerLabel = getCardHolderLabel(centerCard, players);
              const targetName = getCardHolderLabel(targetCard, players);
              const centerRoleBefore = roleOfCard(centerCard);
              const targetRoleBefore = roleOfCard(targetCard);

              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.witch}) đổi ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)}) với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
                description: `${actorName} thực hiện chức năng ${WOLF_ROLE_LABELS.witch} sau khi copy ${WOLF_ROLE_LABELS.doppelganger}.`,
              });
              stepNumber += 1;
              swapCards(centerCard, targetCard);
            }
          }

          if (nestedCopiedRole === "drunk" && validateCenterIndex(nestedPrimaryCenterIndex)) {
            const centerCard = getCenterCard(cards, nestedPrimaryCenterIndex as number);

            if (centerCard) {
              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.drunk}) đổi bài với ${getCardHolderLabel(centerCard, players)}`,
                description: `${actorName} thực hiện chức năng ${WOLF_ROLE_LABELS.drunk} sau khi copy ${WOLF_ROLE_LABELS.doppelganger}.`,
              });
              stepNumber += 1;
              swapCards(card, centerCard);
            }
          }

          if (nestedCopiedRole === "insomniac") {
            const currentRole = roleOfCard(card);

            steps.push({
              id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.insomniac}) xem bài hiện tại: ${getRoleReviewLabel(currentRole)}`,
              description: `${actorName} thực hiện chức năng ${WOLF_ROLE_LABELS.insomniac} sau khi copy ${WOLF_ROLE_LABELS.doppelganger}.`,
            });
            stepNumber += 1;
          }

          if (nestedCopiedRole === "werewolf") {
            const werewolfTeammateNames = cards
              .filter(
                (possibleTeammateCard) =>
                  possibleTeammateCard.player_id &&
                  possibleTeammateCard.player_id !== card.player_id &&
                  isWerewolfRole(wakingRoleByPlayerId.get(possibleTeammateCard.player_id as string))
              )
              .map((possibleTeammateCard) => getPlayerName(players, possibleTeammateCard.player_id));
            const nestedWerewolfPrefix = `${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf}`;

            if (werewolfTeammateNames.length > 0) {
              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${nestedWerewolfPrefix}) thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}`,
                description: `${actorName} copy ${WOLF_ROLE_LABELS.doppelganger} rồi nhân bản Ma Sói nên thức dậy cùng bầy sói.`,
              });
            } else if (validateCenterIndex(nestedPrimaryCenterIndex)) {
              const centerCard = getCenterCard(cards, nestedPrimaryCenterIndex as number);

              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${nestedWerewolfPrefix}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard ? roleOfCard(centerCard) : null)})`,
                description: `${actorName} là sói đơn nên được xem một lá giữa bàn. Hành động này không làm đổi vị trí lá bài.`,
              });
            } else {
              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${nestedWerewolfPrefix}) hoàn tất lượt mà không xem lá giữa bàn`,
                description: `${actorName} không có đồng đội Ma Sói và không chọn xem lá giữa bàn.`,
              });
            }

            stepNumber += 1;
          }

          if (nestedCopiedRole === "werewolf_seer" && nestedPrimaryTargetId) {
            const targetCard = getPlayerCard(cards, nestedPrimaryTargetId);
            const targetName = getPlayerName(players, nestedPrimaryTargetId);

            steps.push({
              id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
              title: getActionTitle(actorName),
              logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.werewolf_seer}) soi ${targetName} (${getRoleReviewLabel(targetCard ? roleOfCard(targetCard) : null)})`,
              description: `${actorName} soi lá của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
            });
            stepNumber += 1;
          }

          if (nestedCopiedRole === "seer") {
            const centerIndexes = getSeerCenterIndexesForAction(
              cards,
              action.target_center_index_2,
              action.target_center_index_3
            );
            const revealedCenters = centerIndexes.map((centerIndex) => {
              const centerCard = getCenterCard(cards, centerIndex);

              return `${getCardHolderLabel(centerCard, players)} (${getWolfCheckLabel(
                centerCard ? isWerewolfRole(roleOfCard(centerCard)) : null
              )})`;
            });

            if (revealedCenters.length > 0) {
              steps.push({
                id: `${role}-${card.player_id}-doppelganger-${stepNumber}`,
                title: getActionTitle(actorName),
                logText: `${actorName} (${WOLF_ROLE_LABELS.copycat} → ${WOLF_ROLE_LABELS.doppelganger} → ${WOLF_ROLE_LABELS.seer}) soi ${revealedCenters.join(" và ")}`,
                description: `${actorName} kiểm tra các lá giữa đã chọn. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
              });
              stepNumber += 1;
            }
          }

          // Copy Cat → Nhân Bản → Copy Cat: chỉ ghi nhận, không có chức năng nào để thực hiện.
        }

        continue;
      }

      if (role === "robber" && action.target_player_id) {
        const targetCard = getPlayerCard(cards, action.target_player_id);

        if (!targetCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const targetName = getCardHolderLabel(targetCard, players);
        const actorRoleBefore = roleOfCard(card);
        const targetRoleBefore = roleOfCard(targetCard);
        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) đổi bài với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
          description: `Trước bước này, ${actorName} đang giữ lá ${getRoleReviewLabel(actorRoleBefore)} và ${targetName} đang giữ lá ${getRoleReviewLabel(targetRoleBefore)}. ${actorName} đổi bài với ${targetName}: lá ${getRoleReviewLabel(actorRoleBefore)} chuyển sang ${targetName}, còn lá ${getRoleReviewLabel(targetRoleBefore)} chuyển sang ${actorName}.`,
        });
        stepNumber += 1;
        immediateRoleRevealByPlayerId.set(card.player_id as string, targetRoleBefore);
        swapCards(card, targetCard);
      }

      if (role === "troublemaker" && action.target_player_id && action.target_player_id_2) {
        const firstTargetCard = getPlayerCard(cards, action.target_player_id);
        const secondTargetCard = getPlayerCard(cards, action.target_player_id_2);

        if (!firstTargetCard || !secondTargetCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const firstTargetName = getCardHolderLabel(firstTargetCard, players);
        const secondTargetName = getCardHolderLabel(secondTargetCard, players);
        const firstRoleBefore = roleOfCard(firstTargetCard);
        const secondRoleBefore = roleOfCard(secondTargetCard);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) đổi bài của ${firstTargetName} (${getRoleReviewLabel(firstRoleBefore)}) với ${secondTargetName} (${getRoleReviewLabel(secondRoleBefore)})`,
          description: `Ở thời điểm ${actorName} hành động, ${firstTargetName} đang giữ lá ${getRoleReviewLabel(firstRoleBefore)} và ${secondTargetName} đang giữ lá ${getRoleReviewLabel(secondRoleBefore)}. ${actorName} đổi chỗ hai lá này: lá ${getRoleReviewLabel(firstRoleBefore)} chuyển sang ${secondTargetName}, còn lá ${getRoleReviewLabel(secondRoleBefore)} chuyển sang ${firstTargetName}.`,
        });
        stepNumber += 1;
        swapCards(firstTargetCard, secondTargetCard);
      }

      const witchCenterIndex = primaryCenterIndex;

      if (role === "witch" && validateCenterIndex(witchCenterIndex) && action.target_player_id) {
        const centerCard = getCenterCard(cards, witchCenterIndex as number);
        const targetCard = getPlayerCard(cards, action.target_player_id);

        if (!centerCard || !targetCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const centerLabel = getCardHolderLabel(centerCard, players);
        const targetName = getCardHolderLabel(targetCard, players);
        const centerRoleBefore = roleOfCard(centerCard);
        const targetRoleBefore = roleOfCard(targetCard);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) đổi ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)}) với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
          description: `${actorName} mở ${centerLabel} rồi đổi lá đó với ${targetName}. Sau khi đổi, ${targetName} nhận ${getRoleReviewLabel(centerRoleBefore)}, còn ${centerLabel} nhận ${getRoleReviewLabel(targetRoleBefore)}.`,
        });
        stepNumber += 1;
        swapCards(centerCard, targetCard);
      }

      if (role === "drunk" && validateCenterIndex(primaryCenterIndex)) {
        const centerCard = getCenterCard(cards, primaryCenterIndex as number);

        if (!centerCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const actorRoleBefore = roleOfCard(card);
        const centerRoleBefore = roleOfCard(centerCard);
        const centerLabel = getCardHolderLabel(centerCard, players);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) đổi bài với ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)})`,
          description: `Khi ${actorName} đổi với ${centerLabel}, ${actorName} đang giữ lá ${getRoleReviewLabel(actorRoleBefore)} còn ${centerLabel} là lá ${getRoleReviewLabel(centerRoleBefore)}. Sau khi đổi, lá ${getRoleReviewLabel(actorRoleBefore)} đi vào ${centerLabel}, còn lá ${getRoleReviewLabel(centerRoleBefore)} chuyển cho ${actorName}.`,
        });
        stepNumber += 1;
        swapCards(card, centerCard);
      }

      if (role === "insomniac") {
        const actorName = getPlayerName(players, card.player_id);
        const currentRole = roleOfCard(card);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: getActionTitle(actorName),
          logText: `${actorName} (${actorRoleLabel}) xem lại bài hiện tại: ${getRoleReviewLabel(currentRole)}`,
          description: `${actorName} xem lá mình đang giữ sau khi các hành động đổi bài trước đó đã được xử lý.`,
        });
        stepNumber += 1;
      }
    }
  }

  const effectiveRoleByCardId = new Map(
    cards.map((card) => [
      card.id,
      attachedRoleByCardId.get(card.id) ?? currentRoleByCardId.get(card.id) ?? card.original_role,
    ])
  );

  return {
    currentRoleByCardId,
    effectiveRoleByCardId,
    cardMovementSummary: {
      orderText:
        steps.length > 0
          ? `Log được xử lý theo thứ tự hành động trong đêm: ${getNightActionResolutionOrderText()}. Copy Cat copy trước, rồi chức năng đã copy chạy ở đúng lượt của role đó.`
          : `Đêm này không có vai nào thực hiện hành động. Nếu có hành động, hệ thống sẽ xử lý theo thứ tự ${getNightActionResolutionOrderText()}.`,
      steps,
    },
    immediateRoleRevealByPlayerId,
  };
}

function buildAllPlayersSummary(
  players: PlayerRow[],
  cards: CardRow[],
  effectiveRoleByCardId?: Map<string, WolfRole>
): WolfPlayerResultSummary[] {
  const playerCardsById = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card])
  );

  return players.filter((player) => playerCardsById.has(player.id)).map((player) => {
    const playerCard = playerCardsById.get(player.id);
    const finalRole = playerCard?.current_role as WolfRole;

    return {
      playerId: player.id,
      playerName: player.name,
      originalRole: playerCard?.original_role as WolfRole,
      finalRole,
      finalTeamRole: playerCard ? effectiveRoleByCardId?.get(playerCard.id) ?? finalRole : finalRole,
    };
  });
}

function buildRoleDeck(cards: CardRow[]) {
  return ROLE_RESOLUTION_ORDER.flatMap((role) =>
    cards.filter((card) => card.original_role === role).map(() => role)
  );
}

function buildWolfResultSnapshot(
  players: PlayerRow[],
  cards: CardRow[],
  actions: ActionRow[],
  votes: VoteRow[]
): WolfResultSnapshot {
  const { cardMovementSummary, effectiveRoleByCardId } = simulateNightResolution(cards, actions, players);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    result: buildGameResult(players, cards, votes, effectiveRoleByCardId),
    cardMovementSummary,
    allPlayersSummary: buildAllPlayersSummary(players, cards, effectiveRoleByCardId),
    roleDeck: buildRoleDeck(cards),
  };
}

async function buildWolfResultSnapshotFromDatabase(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  players: PlayerRow[]
) {
  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", gameId);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", gameId);
  const { data: votesData } = await supabase
    .from("game_votes")
    .select("id, game_id, voter_player_id, target_player_id, is_skip")
    .eq("game_id", gameId);

  return buildWolfResultSnapshot(
    players,
    (cardsData ?? []) as CardRow[],
    (actionsData ?? []) as ActionRow[],
    (votesData ?? []) as VoteRow[]
  );
}

// Ma Sói khó thắng hơn Dân làng (chỉ có 2-3 Sói trong 6-10 người, lại phải qua thảo luận +
// vote của cả bàn) nên phe Sói thắng được thưởng điểm/Xu gấp đôi phe Dân làng thắng.
// Phe thua bị trừ điểm nhưng không mất Xu. Chỉ user đã đăng nhập (có room_players.user_id)
// mới bị ảnh hưởng điểm/Xu.
const WOLF_SCORE_RULES: Record<"villagers" | "werewolves", { points: number; coins: number }> = {
  villagers: { points: 5, coins: 3 },
  werewolves: { points: 10, coins: 5 },
};

const WOLF_LOSS_POINTS_PENALTY = -2;
const WOLF_LOSS_COINS_PENALTY = 0;

function getWolfScoreTeam(role: WolfRole): "villagers" | "werewolves" {
  return isWerewolfRole(role) ? "werewolves" : "villagers";
}

function computeWolfScoreReward(
  currentPlayer: PlayerRow | null,
  resultSnapshot: WolfResultSnapshot | null
): { points: number; coins: number } | null {
  if (!currentPlayer?.user_id || !resultSnapshot) {
    return null;
  }

  const summary = resultSnapshot.allPlayersSummary.find(
    (playerSummary) => playerSummary.playerId === currentPlayer.id
  );

  if (!summary) {
    return null;
  }

  const team = getWolfScoreTeam(summary.finalTeamRole ?? summary.finalRole);

  if (team !== resultSnapshot.result.winnerTeam) {
    return { points: WOLF_LOSS_POINTS_PENALTY, coins: WOLF_LOSS_COINS_PENALTY };
  }

  const rule = WOLF_SCORE_RULES[team];
  return { points: rule.points, coins: rule.coins };
}

// Trao điểm/Xu cho người chơi đã đăng nhập khi ván vào phase "result". Idempotent: RPC
// award_wolf_game_points chống cộng trùng qua unique (game_id, user_id) nên gọi lại an toàn.
async function awardWolfGameScores(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  roomCode: string,
  players: PlayerRow[],
  resultSnapshot: WolfResultSnapshot
) {
  const playerById = new Map(players.map((player) => [player.id, player]));

  const awards = resultSnapshot.allPlayersSummary
    .map((summary) => {
      const player = playerById.get(summary.playerId);

      if (!player?.user_id) {
        return null;
      }

      const team = getWolfScoreTeam(summary.finalTeamRole ?? summary.finalRole);
      const isWinner = team === resultSnapshot.result.winnerTeam;
      const rule = WOLF_SCORE_RULES[team];

      return {
        user_id: player.user_id,
        team,
        role: summary.finalTeamRole ?? summary.finalRole,
        is_winner: isWinner,
        points: isWinner ? rule.points : WOLF_LOSS_POINTS_PENALTY,
        coins: isWinner ? rule.coins : WOLF_LOSS_COINS_PENALTY,
      };
    })
    .filter((award): award is NonNullable<typeof award> => award !== null);

  if (awards.length === 0) {
    return;
  }

  const { error } = await supabase.rpc("award_wolf_game_points", {
    p_game_id: gameId,
    p_room_code: roomCode,
    p_game_key: WOLF_GAME_KEY,
    p_awards: awards,
  });

  if (error) {
    console.error("[wolf] Không thể trao điểm/Xu:", error);
  }
}

async function setWolfGameResultPhase(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  roomCode: string,
  players: PlayerRow[]
) {
  const resultSnapshot = await buildWolfResultSnapshotFromDatabase(supabase, gameId, players);
  const { error } = await supabase
    .from("game_sessions")
    .update({
      phase: "result",
      result_snapshot: resultSnapshot,
    })
    .eq("id", gameId);

  if (!error) {
    await awardWolfGameScores(supabase, gameId, roomCode, players, resultSnapshot);
    return;
  }

  if (isMissingResultSnapshotColumnError(error)) {
    await supabase.from("game_sessions").update({ phase: "result" }).eq("id", gameId);
    await awardWolfGameScores(supabase, gameId, roomCode, players, resultSnapshot);
  }
}

async function saveWolfGameResultSnapshot(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  resultSnapshot: WolfResultSnapshot
) {
  const { error } = await supabase
    .from("game_sessions")
    .update({ result_snapshot: resultSnapshot })
    .eq("id", gameId);

  return !error;
}

async function resolveNightActions(gameId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", gameId);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", gameId);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const { currentRoleByCardId } = simulateNightResolution(cards, actions);

  await Promise.all(
    cards.map((card) =>
      supabase
        .from("game_cards")
        .update({ current_role: currentRoleByCardId.get(card.id) ?? card.original_role })
        .eq("id", card.id)
    )
  );
}

export async function listPublicWolfRooms(): Promise<WolfPublicRoomsResult> {
  return listPublicRoomsByGameKey(WOLF_GAME_KEY);
}

export async function createWolfRoom(
  playerName?: string,
  avatarKey?: string,
  isPublic = true,
  avatarObjectKey?: string | null,
  userId?: string | null
): Promise<WolfActionResult> {
  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const playerAvatarObjectKey = getUsableAvatarObjectKey(avatarObjectKey, sessionId);
  const playerAvatarUrl = getUploadedPlayerAvatarUrl(playerAvatarObjectKey);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({ code, game_key: WOLF_GAME_KEY, is_public: isPublic })
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

    const { data: hostPlayer, error: playerError } = await insertWolfRoomPlayer(
      supabase,
      {
        room_id: room.id,
        session_id: sessionId,
        name,
        avatar_key: playerAvatarKey,
        avatar_object_key: playerAvatarObjectKey,
        user_id: userId,
        is_host: true,
        is_ready: true,
      }
    );

    if (playerError || !hostPlayer) {
      await supabase.from("rooms").delete().eq("id", room.id);
      return {
        ok: false,
        error:
          getAvatarObjectKeyErrorMessage(playerError) ??
          "Không thể thêm người chơi vào phòng.",
      };
    }

    await supabase
      .from("rooms")
      .update({ host_player_id: hostPlayer.id })
      .eq("id", room.id);

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

export async function joinWolfRoom(
  roomCode: string,
  playerName?: string,
  avatarKey?: string,
  avatarObjectKey?: string | null,
  userId?: string | null
): Promise<WolfActionResult> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Mã phòng phải gồm đúng 4 chữ cái từ a đến z." };
  }

  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const playerAvatarObjectKey = getUsableAvatarObjectKey(avatarObjectKey, sessionId);
  const playerAvatarUrl = getUploadedPlayerAvatarUrl(playerAvatarObjectKey);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .single();

  if (roomError || !room) {
    return {
      ok: false,
      error:
        getDatabaseErrorMessage(roomError?.code) ?? "Không tìm thấy phòng với mã này.",
    };
  }

  // Người cuối rời phòng khiến phòng bị đánh dấu "finished". Phòng rỗng như vậy chỉ là
  // phòng bỏ lại, không phải đang chơi — hồi sinh để vào lại được thay vì chặn luôn.
  if (room.status === "finished") {
    const { count: abandonedPlayerCount } = await supabase
      .from("room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if ((abandonedPlayerCount ?? 0) === 0) {
      await supabase
        .from("rooms")
        .update({ status: "waiting", current_game_id: null })
        .eq("id", room.id);
      room.status = "waiting";
      room.current_game_id = null;
    }
  }

  if (room.status !== "waiting") {
    if (room.status !== "playing" || !room.current_game_id) {
      return { ok: false, error: "Phòng này đã bắt đầu hoặc đã kết thúc." };
    }

    const { data: game } = await supabase
      .from("game_sessions")
      .select("phase")
      .eq("id", room.current_game_id)
      .maybeSingle();

    if (game?.phase !== "result") {
      return { ok: false, error: "Phòng này đang chơi. Hãy chờ ván hiện tại kết thúc." };
    }

    await supabase
      .from("rooms")
      .update({ status: "waiting", current_game_id: null })
      .eq("id", room.id);
    await supabase
      .from("room_players")
      .update({ is_ready: false })
      .eq("room_id", room.id)
      .eq("is_host", false);
    room.status = "waiting";
    room.current_game_id = null;
  }

  const { data: existingPlayer } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingPlayer) {
    const updateError = await updateWolfRoomPlayerIdentity(
      supabase,
      existingPlayer.id,
      name,
      playerAvatarKey,
      playerAvatarObjectKey,
      userId
    );

    if (updateError) {
      return {
        ok: false,
        error:
          getAvatarObjectKeyErrorMessage(updateError) ??
          "Không thể cập nhật tên hoặc avatar người chơi.",
      };
    }

    await safeBroadcastWolfRoomUpdate(room.code);

    return {
      ok: true,
      roomCode: room.code,
      playerId: existingPlayer.id,
      playerName: name,
      playerAvatarKey,
      playerAvatarObjectKey,
      playerAvatarUrl,
    };
  }

  const { count: activePlayerCount } = await supabase
    .from("room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((activePlayerCount ?? 0) >= MAX_PLAYERS) {
    return { ok: false, error: "Phòng đã đủ người." };
  }

  // Phòng rỗng thì không còn host: người vào đầu tiên nhận quyền host, nếu không sẽ
  // không ai bấm bắt đầu được.
  const shouldBecomeHost = (activePlayerCount ?? 0) === 0;

  const { data: player, error: playerError } = await insertWolfRoomPlayer(
    supabase,
    {
      room_id: room.id,
      session_id: sessionId,
      name,
      avatar_key: playerAvatarKey,
      avatar_object_key: playerAvatarObjectKey,
      user_id: userId,
      is_host: shouldBecomeHost,
      is_ready: shouldBecomeHost,
    }
  );

  if (playerError || !player) {
    return {
      ok: false,
      error:
        getAvatarObjectKeyErrorMessage(playerError) ??
        "Không thể vào phòng. Vui lòng thử lại.",
    };
  }

  if (shouldBecomeHost) {
    await supabase.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);
  }

  await safeBroadcastWolfRoomUpdate(room.code);

  return {
    ok: true,
    roomCode: room.code,
    playerId: player.id,
    playerName: name,
    playerAvatarKey,
    playerAvatarObjectKey,
    playerAvatarUrl,
  };
}

// Cho phép người chơi đổi tên/avatar khi đang ở phòng chờ (chưa bắt đầu).
export async function updateWolfPlayerProfile(
  roomCode: string,
  playerName?: string,
  avatarKey?: string,
  avatarObjectKey?: string | null,
  userId?: string | null
): Promise<WolfActionResult> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return { ok: false, error: "Mã phòng không hợp lệ." };
  }

  const sessionId = await getPlayerSessionId();

  if (!sessionId) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const supabase = createSupabaseAdminClient();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);
  const requestedAvatarObjectKey = getRequestedAvatarObjectKey(avatarObjectKey, sessionId);

  if (!requestedAvatarObjectKey.ok) {
    return { ok: false, error: requestedAvatarObjectKey.error };
  }

  const playerAvatarObjectKey = requestedAvatarObjectKey.avatarObjectKey;
  const playerAvatarUrl = getUploadedPlayerAvatarUrl(playerAvatarObjectKey);

  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, game_key, status")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  if (!room) {
    return { ok: false, error: "Không tìm thấy phòng." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Chỉ đổi được tên/avatar khi đang ở phòng chờ." };
  }

  const { data: player } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!player) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const updateError = await updateWolfRoomPlayerIdentity(
    supabase,
    player.id,
    name,
    playerAvatarKey,
    playerAvatarObjectKey,
    userId
  );

  if (updateError) {
    return {
      ok: false,
      error:
        getAvatarObjectKeyErrorMessage(updateError) ??
        "Không thể cập nhật tên hoặc avatar người chơi.",
    };
  }

  await safeBroadcastWolfRoomUpdate(room.code);

  return {
    ok: true,
    roomCode: room.code,
    playerId: player.id,
    playerName: name,
    playerAvatarKey,
    playerAvatarObjectKey,
    playerAvatarUrl,
  };
}

export async function leaveWolfRoom(roomCode: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code) || !sessionId) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  if (!room) {
    return;
  }

  if (room.status !== "waiting") {
    if (room.status !== "playing" || !room.current_game_id) {
      return;
    }

    const game = await getWolfGameRowById(supabase, room.current_game_id);

    if (game?.phase !== "result") {
      return;
    }

    if (!game.result_snapshot) {
      const players = await getActivePlayers(supabase, room);
      const resultSnapshot = await buildWolfResultSnapshotFromDatabase(
        supabase,
        room.current_game_id,
        players
      );
      const resultSnapshotSaved = await saveWolfGameResultSnapshot(
        supabase,
        room.current_game_id,
        resultSnapshot
      );

      if (!resultSnapshotSaved) {
        return;
      }

      await awardWolfGameScores(supabase, room.current_game_id, room.code, players, resultSnapshot);
    }
  }

  const { data: player } = await supabase
    .from("room_players")
    .select("id, is_host")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!player) {
    return;
  }

  await supabase
    .from("room_players")
    .delete()
    .eq("id", player.id);

  if (!player.is_host) {
    await safeBroadcastWolfRoomUpdate(room.code);
    return;
  }

  const { data: nextHost } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextHost) {
    await supabase
      .from("rooms")
      .update({ host_player_id: null, status: "finished", current_game_id: null })
      .eq("id", room.id);
    await safeBroadcastWolfRoomUpdate(room.code);
    return;
  }

  await supabase
    .from("room_players")
    .update({ is_host: true, is_ready: true })
    .eq("id", nextHost.id);
  await supabase
    .from("rooms")
    .update({ host_player_id: nextHost.id })
    .eq("id", room.id);
  await safeBroadcastWolfRoomUpdate(room.code);
}

export async function kickWolfPlayer(
  roomCode: string,
  targetPlayerId: string
): Promise<WolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy phòng." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);
  const targetPlayer = players.find((player) => player.id === targetPlayerId) ?? null;

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được kick người chơi." };
  }

  if (room.status !== "waiting") {
    return { ok: false, error: "Chỉ có thể kick khi phòng đang chờ." };
  }

  if (!targetPlayer) {
    return { ok: false, error: "Người chơi không còn trong phòng." };
  }

  if (targetPlayer.id === currentPlayer?.id || targetPlayer.is_host) {
    return { ok: false, error: "Không thể kick chủ phòng." };
  }

  const { error } = await supabase
    .from("room_players")
    .delete()
    .eq("id", targetPlayer.id)
    .eq("room_id", room.id);

  if (error) {
    return { ok: false, error: "Không thể kick người chơi. Vui lòng thử lại." };
  }

  await safeBroadcastWolfRoomUpdate(room.code);

  return { ok: true };
}

export async function toggleWolfReady(roomCode: string): Promise<void> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code) || !sessionId) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("id")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  if (!room) {
    return;
  }

  const { data: player } = await supabase
    .from("room_players")
    .select("id, is_ready, is_host")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!player) {
    return;
  }

  // Host luôn mặc định sẵn sàng — không cho phép bật/tắt trạng thái này.
  if (player.is_host) {
    return;
  }

  await supabase
    .from("room_players")
    .update({
      is_ready: !player.is_ready,
    })
    .eq("id", player.id);
  await safeBroadcastWolfRoomUpdate(code);
}

export async function getWolfLobbyState(roomCode: string): Promise<WolfLobbyState | null> {
  const code = normalizeRoomCode(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  const liveProfilesByUserId = await getLivePlayerProfilesByUserId(supabase, players.map((player) => player.user_id));

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    players: players.map((player) => mapLobbyPlayer(player, liveProfilesByUserId)),
    currentPlayerId: players.find((player) => player.session_id === sessionId)?.id ?? null,
  };
}

export async function getWolfSpectatorState(roomCode: string): Promise<WolfSpectatorState | null> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, game_key, status, host_player_id, current_game_id")
    .eq("code", code)
    .eq("game_key", WOLF_GAME_KEY)
    .maybeSingle();

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  let game: GameRow | null = null;
  let result: WolfGameResult | null = null;

  if (room.current_game_id) {
    game = await getWolfGameRowById(supabase, room.current_game_id);

    if (game?.phase === "result") {
      if (game.result_snapshot) {
        result = game.result_snapshot.result;
      } else {
        const { data: cardsData } = await supabase
          .from("game_cards")
          .select("id, game_id, player_id, center_index, original_role, current_role")
          .eq("game_id", game.id);
        const { data: votesData } = await supabase
          .from("game_votes")
          .select("id, game_id, voter_player_id, target_player_id, is_skip")
          .eq("game_id", game.id);
        const { data: actionsData } = await supabase
          .from("game_actions")
          .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
          .eq("game_id", game.id);
        const resultCards = (cardsData ?? []) as CardRow[];
        // Cần mô phỏng lại để biết chức năng dính theo lá Nhân Bản / Copy Cat khi tính phe thắng.
        const { effectiveRoleByCardId } = simulateNightResolution(
          resultCards,
          (actionsData ?? []) as ActionRow[],
          players
        );

        result = buildGameResult(players, resultCards, (votesData ?? []) as VoteRow[], effectiveRoleByCardId);
      }
    }
  }

  const spectatorLiveProfilesByUserId = await getLivePlayerProfilesByUserId(
    supabase,
    players.map((player) => player.user_id)
  );

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    players: players.map((player) => mapLobbyPlayer(player, spectatorLiveProfilesByUserId)),
    game: game
      ? {
          phase: game.phase,
        }
      : null,
    result,
  };
}

export async function startWolfGame(
  roomCode: string,
  selectedRoles?: WolfRole[]
): Promise<WolfStartGameResult> {
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

  if (players.length < 3) {
    return { ok: false, error: "Cần ít nhất 3 người chơi để bắt đầu." };
  }

  const unreadyPlayer = players.find((player) => !player.is_ready);

  if (unreadyPlayer) {
    return { ok: false, error: "Còn người chơi chưa sẵn sàng." };
  }

  const roleDeckValidation = validateSelectedRoleDeck(selectedRoles, players.length + 3);

  if (!roleDeckValidation.ok) {
    return roleDeckValidation;
  }

  const { data: game, error: gameError } = await supabase
    .from("game_sessions")
    .insert({ room_id: room.id, phase: "card_reveal", round_number: 1 })
    .select("id")
    .single();

  if (gameError || !game) {
    return {
      ok: false,
      error: getDatabaseErrorMessage(gameError?.code) ?? "Không thể tạo ván mới. Cần chạy migration gameplay.",
    };
  }

  const roles = shuffleRoles(roleDeckValidation.roles);
  const playerCards = players.map((player, index) => ({
    game_id: game.id,
    player_id: player.id,
    original_role: roles[index],
    current_role: roles[index],
  }));
  const centerCards = roles.slice(players.length).map((role, centerIndex) => ({
    game_id: game.id,
    center_index: centerIndex,
    original_role: role,
    current_role: role,
  }));

  const { error: cardError } = await supabase
    .from("game_cards")
    .insert([...playerCards, ...centerCards]);

  if (cardError) {
    console.error("Failed to insert wolf game cards", {
      code: cardError.code,
      details: cardError.details,
      hint: cardError.hint,
      message: cardError.message,
      roles: roleDeckValidation.roles,
    });
    await supabase.from("game_sessions").delete().eq("id", game.id);
    if (cardError.message.includes("invalid input value for enum")) {
      return {
        ok: false,
        error: "Không thể chia bài vì database chưa có enum role mới. Cần chạy migration wolf_extra_roles.",
      };
    }

    return { ok: false, error: "Không thể chia bài cho ván mới." };
  }

  await supabase
    .from("rooms")
    .update({ status: "playing", current_game_id: game.id })
    .eq("id", room.id);

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

export async function getWolfPlayState(roomCode: string): Promise<WolfPlayState | null> {
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

  let game: Awaited<ReturnType<typeof getWolfGameRowById>> = null;

  for (let attempt = 0; attempt < PLAY_STATE_READ_RETRY_ATTEMPTS; attempt += 1) {
    game = await getWolfGameRowById(supabase, room.current_game_id);
    if (game) {
      break;
    }
    if (attempt < PLAY_STATE_READ_RETRY_ATTEMPTS - 1) {
      await delayMs(PLAY_STATE_READ_RETRY_DELAY_MS);
    }
  }

  if (!game) {
    return null;
  }

  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", game.id);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", game.id);
  const { data: votesData } = await supabase
    .from("game_votes")
    .select("id, game_id, voter_player_id, target_player_id, is_skip")
    .eq("game_id", game.id);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const votes = (votesData ?? []) as VoteRow[];
  const shouldRevealAll = game.phase === "result";
  const shouldRevealVotes = game.phase === "voting" || shouldRevealAll;
  const liveResultSnapshot =
    shouldRevealAll && !game.result_snapshot
      ? buildWolfResultSnapshot(players, cards, actions, votes)
      : null;
  const resultSnapshot = shouldRevealAll ? game.result_snapshot ?? liveResultSnapshot : null;

  if (liveResultSnapshot) {
    await saveWolfGameResultSnapshot(supabase, game.id, liveResultSnapshot);
  }

  const cardMovementSummary = resultSnapshot?.cardMovementSummary ?? null;
  const phaseConfirmations = isConfirmablePhase(game.phase)
    ? await getPhaseConfirmations(supabase, game.id, game.phase)
    : [];
  const myCard = currentPlayer ? getPlayerCard(cards, currentPlayer.id) : null;
  const roleByPlayerIdAfterCopycat = getRoleByPlayerIdAfterCopycat(cards, actions);
  const werewolfPlayerIdsAfterCopycat = getWerewolfPlayerIdsAfterCopycat(cards, actions);
  const currentPlayerRoleAfterCopycat = currentPlayer
    ? roleByPlayerIdAfterCopycat.get(currentPlayer.id) ?? null
    : null;
  const werewolfTeammates =
    currentPlayer && isWerewolfRole(currentPlayerRoleAfterCopycat)
      ? werewolfPlayerIdsAfterCopycat
          .filter((playerId) => playerId !== currentPlayer.id)
          .map((playerId) => ({
            playerId,
            playerName: getPlayerName(players, playerId),
          }))
      : [];
  const myAction = currentPlayer
    ? actions.find((action) => action.player_id === currentPlayer.id) ?? null
    : null;
  const myVote = currentPlayer
    ? votes.find((vote) => vote.voter_player_id === currentPlayer.id) ?? null
    : null;
  const actionPlayerIds = new Set(actions.map((action) => action.player_id));
  const voteByVoterId = new Map(votes.map((vote) => [vote.voter_player_id, vote.target_player_id]));
  const skippedVotePlayerIds = new Set(
    votes
      .filter((vote) => vote.is_skip || !vote.target_player_id)
      .map((vote) => vote.voter_player_id)
  );
  const votePlayerIds = new Set(votes.map((vote) => vote.voter_player_id));
  const phaseReadyPlayerIds = phaseConfirmations.map((confirmation) => confirmation.player_id);
  const phaseReadyPlayerIdSet = new Set(phaseReadyPlayerIds);
  const activeNightTurn =
    game.phase === "night" ? getActiveNightTurn(players, cards, actions, phaseReadyPlayerIdSet) : null;
  const playerCardsById = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card])
  );
  const shouldRevealMyCurrentRole = shouldRevealAll;
  const shouldRevealInsomniacCurrentRole =
    game.phase === "night" &&
    currentPlayer &&
    activeNightTurn?.playerId === currentPlayer.id &&
    activeNightTurn.activeRole === "insomniac";
  const revealedCenterIndexes = new Set<number>();
  const seerWolfCheckCenterIndexes = new Set<number>();

  if (myAction?.action_type === "seer") {
    for (const centerIndex of getSeerCenterIndexesForAction(
      cards,
      myAction.target_center_index,
      myAction.target_center_index_2
    )) {
      revealedCenterIndexes.add(centerIndex);
      seerWolfCheckCenterIndexes.add(centerIndex);
    }
  }

  if (
    myAction?.action_type === "copycat" &&
    validateCenterIndex(myAction.target_center_index)
  ) {
    revealedCenterIndexes.add(myAction.target_center_index as number);
    const copiedCard = getCenterCard(cards, myAction.target_center_index as number);

    if (copiedCard?.original_role === "seer") {
      for (const centerIndex of getSeerCenterIndexesForAction(
        cards,
        myAction.target_center_index_2,
        myAction.target_center_index_3,
        myAction.target_center_index
      )) {
        revealedCenterIndexes.add(centerIndex);
        seerWolfCheckCenterIndexes.add(centerIndex);
      }
    } else if (
      copiedCard?.original_role === "doppelganger" &&
      getCopycatDoppelgangerCopiedRole(cards, myAction) === "seer"
    ) {
      for (const centerIndex of getSeerCenterIndexesForAction(
        cards,
        myAction.target_center_index_2,
        myAction.target_center_index_3,
        myAction.target_center_index
      )) {
        revealedCenterIndexes.add(centerIndex);
        seerWolfCheckCenterIndexes.add(centerIndex);
      }
    } else {
      if (validateCenterIndex(myAction.target_center_index_2)) {
        revealedCenterIndexes.add(myAction.target_center_index_2 as number);
      }
      if (validateCenterIndex(myAction.target_center_index_3)) {
        revealedCenterIndexes.add(myAction.target_center_index_3 as number);
      }
    }
  }

  if (myAction?.action_type === "doppelganger") {
    const copiedRole = getDoppelgangerCopiedRole(cards, myAction);

    if (copiedRole === "seer") {
      for (const centerIndex of getSeerCenterIndexesForAction(
        cards,
        myAction.target_center_index,
        myAction.target_center_index_2
      )) {
        revealedCenterIndexes.add(centerIndex);
        seerWolfCheckCenterIndexes.add(centerIndex);
      }
    } else if (copiedRole !== "copycat" && validateCenterIndex(myAction.target_center_index)) {
      revealedCenterIndexes.add(myAction.target_center_index as number);

      if (validateCenterIndex(myAction.target_center_index_2)) {
        revealedCenterIndexes.add(myAction.target_center_index_2 as number);
      }
      if (validateCenterIndex(myAction.target_center_index_3)) {
        revealedCenterIndexes.add(myAction.target_center_index_3 as number);
      }
    }
  }

  if (myAction?.action_type === "witch" && validateCenterIndex(myAction.target_center_index)) {
    revealedCenterIndexes.add(myAction.target_center_index as number);
  }

  if (
    myAction?.action_type === "werewolf" &&
    werewolfPlayerIdsAfterCopycat.length === 1 &&
    validateCenterIndex(myAction.target_center_index)
  ) {
    revealedCenterIndexes.add(myAction.target_center_index as number);
  }

  const playLiveProfilesByUserId = await getLivePlayerProfilesByUserId(
    supabase,
    players.map((player) => player.user_id)
  );

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    game: {
      id: game.id,
      phase: game.phase,
      roundNumber: game.round_number,
      discussionEndsAt: game.discussion_ends_at,
    },
    players: players.map((player) => ({
      ...mapLobbyPlayer(player, playLiveProfilesByUserId),
      role: shouldRevealAll ? playerCardsById.get(player.id)?.current_role ?? null : null,
      voteTargetPlayerId: shouldRevealVotes ? voteByVoterId.get(player.id) ?? null : null,
      hasSkippedVote: shouldRevealVotes ? skippedVotePlayerIds.has(player.id) : false,
      hasVoted: votePlayerIds.has(player.id),
      hasNightAction: actionPlayerIds.has(player.id),
      isPhaseReady: phaseReadyPlayerIdSet.has(player.id),
    })),
    currentPlayerId: currentPlayer?.id ?? null,
    isCurrentPlayerHost: isHost(currentPlayer, room),
    myCard: myCard
      ? {
          originalRole: myCard.original_role,
          currentRole: shouldRevealMyCurrentRole ? myCard.current_role : null,
          nightReviewRole:
            shouldRevealInsomniacCurrentRole
              ? getInsomniacCurrentRole(currentPlayer, cards, actions, players)
              : game.phase === "night" || game.phase === "night_review"
              ? getNightReviewRole(currentPlayer, myAction, cards, players, actions)
              : null,
        }
      : null,
    werewolfTeammates,
    centerCards: [0, 1, 2].map((index) => {
      const centerCard = getCenterCard(cards, index);
      const isSeerWolfCheck = seerWolfCheckCenterIndexes.has(index);
      return {
        index,
        role:
          (shouldRevealAll || (revealedCenterIndexes.has(index) && !isSeerWolfCheck))
            ? centerCard?.original_role ?? null
            : null,
        isWerewolf:
          !shouldRevealAll && isSeerWolfCheck
            ? getCenterIsWerewolf(cards, index)
            : null,
      };
    }),
    playerReveals: shouldRevealAll ? [] : buildPlayerReveals(currentPlayer, myAction, cards, players),
    myAction: myAction
      ? {
          actionType: myAction.action_type,
          targetPlayerId: myAction.target_player_id,
          targetPlayerId2: myAction.target_player_id_2,
          targetPlayerId3: myAction.target_player_id_3,
          targetCenterIndex: myAction.target_center_index,
          targetCenterIndex2: myAction.target_center_index_2,
          targetCenterIndex3: myAction.target_center_index_3,
        }
      : null,
    myVoteTargetPlayerId: myVote?.target_player_id ?? null,
    activeNightTurn:
      currentPlayer && activeNightTurn?.playerId === currentPlayer.id
        ? activeNightTurn
        : null,
    isCurrentNightTurnActionSubmitted:
      currentPlayer && activeNightTurn?.playerId === currentPlayer.id
        ? isNightTurnActionSubmitted(activeNightTurn, myAction, cards)
        : false,
    isNightTurnInProgress: Boolean(activeNightTurn),
    isCurrentPlayerPhaseReady: currentPlayer ? phaseReadyPlayerIdSet.has(currentPlayer.id) : false,
    phaseReadyPlayerIds,
    nightReviewMessages: buildNightReviewMessages(currentPlayer, myAction, cards, players, actions),
    nightReminder:
      game.phase === "discussion"
        ? buildWolfNightReminder(currentPlayer, myAction, cards, players, actions)
        : null,
    allNightActionsSubmitted: game.phase === "night" ? !activeNightTurn : players.every((player) => actionPlayerIds.has(player.id)),
    allVotesSubmitted: players.every((player) => voteByVoterId.has(player.id)),
    allPhaseConfirmationsSubmitted:
      isConfirmablePhase(game.phase) && players.every((player) => phaseReadyPlayerIdSet.has(player.id)),
    result: resultSnapshot?.result ?? null,
    cardMovementSummary,
    allPlayersSummary: shouldRevealAll
      ? resultSnapshot?.allPlayersSummary ?? buildAllPlayersSummary(players, cards)
      : null,
    roleDeck: resultSnapshot?.roleDeck ?? buildRoleDeck(cards),
    myScoreReward: computeWolfScoreReward(currentPlayer, resultSnapshot ?? null),
  };
}

export async function revealWolfCenterCard(
  roomCode: string,
  centerIndex: number,
  revealAsRole?: WolfRole | null,
  doppelgangerTargetPlayerId?: string | null
): Promise<WolfCenterRevealResult> {
  const state = await getWolfPlayState(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!state || !sessionId) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (state.game.phase !== "night") {
    return { ok: false, error: "Chỉ được xem lá giữa trong giai đoạn ban đêm." };
  }

  if (!validateCenterIndex(centerIndex)) {
    return { ok: false, error: "Lá giữa được chọn không hợp lệ." };
  }

  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", room.current_game_id);
  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, "night");
  const confirmedNightPlayerIds = new Set(confirmations.map((confirmation) => confirmation.player_id));
  const myCard = getPlayerCard(cards, currentPlayer.id);
  const myRole = myCard?.original_role;
  const activeNightTurn = getActiveNightTurn(players, cards, actions, confirmedNightPlayerIds);

  if (!activeNightTurn || activeNightTurn.playerId !== currentPlayer.id) {
    return { ok: false, error: "Chưa tới lượt của bạn." };
  }

  const activeRole = activeNightTurn.activeRole;
  const doppelgangerTargetRole =
    activeRole === "doppelganger" && doppelgangerTargetPlayerId
      ? getPlayerCard(cards, doppelgangerTargetPlayerId)?.original_role ?? null
      : null;
  const doppelgangerCopiedRole =
    activeRole === "doppelganger" ? activeNightTurn.copiedRole ?? doppelgangerTargetRole : null;

  if (
    activeRole === "doppelganger" &&
    revealAsRole &&
    doppelgangerCopiedRole !== revealAsRole
  ) {
    return { ok: false, error: "Chức năng Nhân Bản không khớp với người chơi đã chọn." };
  }

  const revealAsSeer = activeRole === "seer" || doppelgangerCopiedRole === "seer";
  const werewolfCount = getWerewolfPlayerIdsAfterCopycat(cards, actions).length;
  // Sói đơn được xem một lá giữa bàn, kể cả Sói Tiên Tri hay sói do Nhân Bản copy.
  const isLoneWerewolfReveal =
    werewolfCount === 1 &&
    (activeRole === "werewolf" ||
      activeRole === "werewolf_seer" ||
      (activeRole === "doppelganger" &&
        (doppelgangerCopiedRole === "werewolf" || doppelgangerCopiedRole === "werewolf_seer")));
  const canRevealCenter =
    (activeRole === "doppelganger" &&
      (doppelgangerCopiedRole === "seer" ||
        doppelgangerCopiedRole === "witch" ||
        doppelgangerCopiedRole === "drunk")) ||
    activeRole === "seer" ||
    activeRole === "witch" ||
    activeRole === "drunk" ||
    activeRole === "copycat" ||
    isLoneWerewolfReveal;

  if (!canRevealCenter) {
    return { ok: false, error: "Vai trò của bạn không được xem lá giữa bàn lúc này." };
  }

  const centerCard = getCenterCard(cards, centerIndex);

  if (!centerCard) {
    return { ok: false, error: "Không tìm thấy lá giữa đã chọn." };
  }

  const actionAsCopycat = {
    id: "",
    game_id: room.current_game_id,
    player_id: currentPlayer.id,
    action_type: "copycat",
    target_player_id: null,
    target_player_id_2: null,
    target_player_id_3: null,
    target_center_index: centerIndex,
    target_center_index_2: null,
    target_center_index_3: null,
  } satisfies ActionRow;
  const actionsWithCurrentReveal =
    myRole === "copycat" && activeRole === "copycat"
      ? [...actions.filter((action) => action.player_id !== currentPlayer.id), actionAsCopycat]
      : actions;
  const werewolfTeammates =
    myRole === "copycat" && activeRole === "copycat" && isWerewolfRole(centerCard.original_role)
      ? getWerewolfPlayerIdsAfterCopycat(cards, actionsWithCurrentReveal)
          .filter((playerId) => playerId !== currentPlayer.id)
          .map((playerId) => ({
            playerId,
            playerName: getPlayerName(players, playerId),
          }))
      : undefined;

  return {
    ok: true,
    centerIndex,
    role: revealAsSeer ? null : centerCard.original_role,
    isWerewolf: revealAsSeer ? isWerewolfRole(centerCard.original_role) : null,
    werewolfTeammates,
  };
}

export async function revealWolfPlayerCard(
  roomCode: string,
  targetPlayerId: string
): Promise<WolfPlayerRevealResult> {
  const state = await getWolfPlayState(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!state || !sessionId) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (state.game.phase !== "night") {
    return { ok: false, error: "Chỉ được nhân bản trong giai đoạn ban đêm." };
  }

  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  if (targetPlayerId === currentPlayer.id || !players.some((player) => player.id === targetPlayerId)) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
  }

  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", room.current_game_id);
  const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, "night");
  const confirmedNightPlayerIds = new Set(confirmations.map((confirmation) => confirmation.player_id));
  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const activeNightTurn = getActiveNightTurn(players, cards, actions, confirmedNightPlayerIds);
  const myCard = getPlayerCard(cards, currentPlayer.id);
  const canRevealDoppelgangerTarget =
    activeNightTurn?.activeRole === "doppelganger" &&
    (myCard?.original_role === "doppelganger" ||
      (myCard?.original_role === "copycat" && activeNightTurn.isCopycatCopiedRole));
  // Sói Tiên Tri soi người chơi và thấy kết quả ngay trong lượt, trước khi quyết định
  // có xem thêm lá giữa bàn hay không (chỉ sói đơn mới được xem thêm).
  const canRevealWerewolfSeerTarget =
    activeNightTurn?.activeRole === "werewolf_seer" ||
    (activeNightTurn?.activeRole === "doppelganger" && activeNightTurn.copiedRole === "werewolf_seer");

  if (
    !activeNightTurn ||
    activeNightTurn.playerId !== currentPlayer.id ||
    (!canRevealDoppelgangerTarget && !canRevealWerewolfSeerTarget)
  ) {
    return { ok: false, error: "Chưa tới lượt soi bài của bạn." };
  }

  const targetCard = getPlayerCard(cards, targetPlayerId);

  if (!targetCard) {
    return { ok: false, error: "Không tìm thấy bài của người chơi đã chọn." };
  }

  return {
    ok: true,
    playerId: targetPlayerId,
    playerName: getPlayerName(players, targetPlayerId),
    role: targetCard.original_role,
  };
}

export async function submitWolfNightAction(
  roomCode: string,
  input: WolfNightActionInput
): Promise<WolfMutationResult> {
  const state = await getWolfPlayState(roomCode);
  const sessionId = await getPlayerSessionId();

  if (!state || !sessionId) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (state.game.phase !== "night") {
    return { ok: false, error: "Không còn ở giai đoạn ban đêm." };
  }

  const { supabase, room } = await getRoomByCode(roomCode);

  if (!room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: myCard } = await supabase
    .from("game_cards")
    .select("original_role")
    .eq("game_id", room.current_game_id)
    .eq("player_id", currentPlayer.id)
    .maybeSingle();
  const originalRole = myCard?.original_role as WolfRole | undefined;
  const { data: gameCardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const { data: gameActionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", room.current_game_id);
  const gameCards = (gameCardsData ?? []) as CardRow[];
  const gameActions = (gameActionsData ?? []) as ActionRow[];
  const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, "night");
  const confirmedNightPlayerIds = new Set(confirmations.map((confirmation) => confirmation.player_id));
  const activeNightTurn = getActiveNightTurn(players, gameCards, gameActions, confirmedNightPlayerIds);
  const existingAction = gameActions.find((action) => action.player_id === currentPlayer.id) ?? null;

  if (!originalRole || input.actionType !== originalRole) {
    return { ok: false, error: "Hành động không khớp với vai trò của bạn." };
  }

  if (!activeNightTurn || activeNightTurn.playerId !== currentPlayer.id) {
    return { ok: false, error: "Chưa tới lượt của bạn." };
  }

  if (originalRole !== "copycat" && activeNightTurn.activeRole !== originalRole) {
    return { ok: false, error: "Chưa tới lượt vai trò của bạn." };
  }

  const isCopycatCopyTurn = originalRole === "copycat" && activeNightTurn.activeRole === "copycat";
  const isCopycatCopiedRoleTurn = originalRole === "copycat" && activeNightTurn.isCopycatCopiedRole;
  const savedTargetCenterIndex =
    isCopycatCopiedRoleTurn && validateCenterIndex(existingAction?.target_center_index)
      ? existingAction?.target_center_index
      : input.targetCenterIndex;

  const targetPlayerIds = [input.targetPlayerId, input.targetPlayerId2, input.targetPlayerId3].filter(
    Boolean
  ) as string[];
  const activePlayerIds = new Set(players.map((player) => player.id));
  const otherPlayerIds = new Set(
    players.filter((player) => player.id !== currentPlayer.id).map((player) => player.id)
  );

  if (targetPlayerIds.some((playerId) => !activePlayerIds.has(playerId))) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
  }

  if (isCopycatCopyTurn && !validateCenterIndex(input.targetCenterIndex)) {
    return { ok: false, error: "Copy Cat phải chọn một lá giữa bàn để copy." };
  }

  if (originalRole === "robber" && (!input.targetPlayerId || !otherPlayerIds.has(input.targetPlayerId))) {
    return { ok: false, error: "Kẻ Trộm phải chọn một người chơi khác." };
  }

  if (
    originalRole === "troublemaker" &&
    (!input.targetPlayerId ||
      !input.targetPlayerId2 ||
      input.targetPlayerId === input.targetPlayerId2 ||
      !otherPlayerIds.has(input.targetPlayerId) ||
      !otherPlayerIds.has(input.targetPlayerId2))
  ) {
    return { ok: false, error: "Kẻ Gây Rối phải chọn hai người chơi khác nhau." };
  }

  if (originalRole === "drunk" && !validateCenterIndex(input.targetCenterIndex)) {
    return { ok: false, error: "Say Rượu phải chọn một lá giữa bàn." };
  }

  if (originalRole === "werewolf") {
    const werewolfCount = getWerewolfPlayerIdsAfterCopycat(gameCards, gameActions).length;

    if (werewolfCount > 1 && (input.targetCenterIndex != null || input.targetCenterIndex2 != null)) {
      return { ok: false, error: "Có từ 2 Ma Sói trở lên nên Ma Sói không được xem lá giữa bàn." };
    }

    if (
      werewolfCount === 1 &&
      ((input.targetCenterIndex != null && !validateCenterIndex(input.targetCenterIndex)) ||
        input.targetCenterIndex2 != null)
    ) {
      return { ok: false, error: "Ma Sói đơn chỉ được xem tối đa một lá giữa bàn." };
    }
  }

  if (originalRole === "doppelganger") {
    if (!input.targetPlayerId || !otherPlayerIds.has(input.targetPlayerId)) {
      return { ok: false, error: "Nhân Bản phải chọn một người chơi khác để copy." };
    }

    const copiedCard = getPlayerCard(gameCards, input.targetPlayerId);
    const copiedRole = copiedCard?.original_role;

    if (!copiedRole) {
      return { ok: false, error: "Không tìm thấy chức năng của người chơi được nhân bản." };
    }

    if (
      copiedRole === "seer" &&
      Boolean(input.targetPlayerId2)
    ) {
      return { ok: false, error: "Nhân Bản copy Tiên Tri chỉ được chọn lá giữa bàn." };
    }

    if (
      copiedRole === "seer" &&
      !isSeerCenterSubmissionComplete(gameCards, input.targetCenterIndex ?? null, input.targetCenterIndex2 ?? null)
    ) {
      return { ok: false, error: "Nhân Bản copy Tiên Tri phải chọn lá giữa theo thứ tự, và dừng ngay nếu lần đầu thấy Sói." };
    }

    if (
      copiedRole === "werewolf_seer" &&
      (!input.targetPlayerId2 || !activePlayerIds.has(input.targetPlayerId2))
    ) {
      return { ok: false, error: "Nhân Bản copy Sói Tiên Tri phải chọn một người chơi để soi." };
    }

    if (copiedRole === "werewolf" || copiedRole === "werewolf_seer") {
      // Nhân Bản copy Ma Sói nghĩa là người bị copy vẫn còn đó CỘNG THÊM Nhân Bản, nên
      // tổng số Ma Sói sau khi copy luôn >= 2. gameActions được lấy trước khi lưu hành động
      // này nên chưa tính Nhân Bản là Ma Sói — phải cộng thêm 1 cho chính người đang thao tác.
      const werewolfCount =
        getWerewolfPlayerIdsAfterCopycat(gameCards, gameActions).filter(
          (playerId) => playerId !== currentPlayer.id
        ).length + 1;
      const copiedRoleLabel = WOLF_ROLE_LABELS[copiedRole];

      if (werewolfCount > 1 && (input.targetCenterIndex != null || input.targetCenterIndex2 != null)) {
        return {
          ok: false,
          error: `Có từ 2 Ma Sói trở lên nên Nhân Bản copy ${copiedRoleLabel} không được xem lá giữa bàn.`,
        };
      }

      if (
        werewolfCount === 1 &&
        ((input.targetCenterIndex != null && !validateCenterIndex(input.targetCenterIndex)) ||
          input.targetCenterIndex2 != null)
      ) {
        return {
          ok: false,
          error: `Nhân Bản copy ${copiedRoleLabel} khi là sói đơn chỉ được xem tối đa một lá giữa bàn.`,
        };
      }
    }

    if (copiedRole === "robber" && (!input.targetPlayerId2 || !otherPlayerIds.has(input.targetPlayerId2))) {
      return { ok: false, error: "Nhân Bản copy Kẻ Trộm phải chọn một người chơi khác để đổi bài." };
    }

    if (
      copiedRole === "troublemaker" &&
      (!input.targetPlayerId2 ||
        !input.targetPlayerId3 ||
        input.targetPlayerId2 === input.targetPlayerId3 ||
        !otherPlayerIds.has(input.targetPlayerId2) ||
        !otherPlayerIds.has(input.targetPlayerId3))
    ) {
      return { ok: false, error: "Nhân Bản copy Kẻ Gây Rối phải chọn hai người chơi khác nhau." };
    }

    if (
      copiedRole === "witch" &&
      (!validateCenterIndex(input.targetCenterIndex) ||
        !input.targetPlayerId2 ||
        !activePlayerIds.has(input.targetPlayerId2))
    ) {
      return { ok: false, error: "Nhân Bản copy Phù Thuỷ phải chọn một lá giữa bàn và một người nhận." };
    }

    if (copiedRole === "drunk" && !validateCenterIndex(input.targetCenterIndex)) {
      return { ok: false, error: "Nhân Bản copy Say Rượu phải chọn một lá giữa bàn." };
    }

    if (copiedRole === "copycat") {
      input.targetPlayerId2 = null;
      input.targetPlayerId3 = null;
      input.targetCenterIndex = null;
      input.targetCenterIndex2 = null;
      input.targetCenterIndex3 = null;
    }
  }

  if (originalRole === "seer") {
    if (Boolean(input.targetPlayerId)) {
      return { ok: false, error: "Tiên Tri chỉ được chọn lá giữa bàn." };
    }

    if (!isSeerCenterSubmissionComplete(gameCards, input.targetCenterIndex ?? null, input.targetCenterIndex2 ?? null)) {
      return { ok: false, error: "Tiên Tri phải chọn lá giữa theo thứ tự, và dừng ngay nếu lần đầu thấy Sói." };
    }
  }

  if (originalRole === "werewolf_seer") {
    if (!input.targetPlayerId || !activePlayerIds.has(input.targetPlayerId)) {
      return { ok: false, error: "Sói Tiên Tri phải chọn một người chơi để soi." };
    }

    const werewolfCount = getWerewolfPlayerIdsAfterCopycat(gameCards, gameActions).length;

    if (werewolfCount > 1 && (input.targetCenterIndex != null || input.targetCenterIndex2 != null)) {
      return { ok: false, error: "Có từ 2 Ma Sói trở lên nên Sói Tiên Tri không được xem lá giữa bàn." };
    }

    if (
      werewolfCount === 1 &&
      ((input.targetCenterIndex != null && !validateCenterIndex(input.targetCenterIndex)) ||
        input.targetCenterIndex2 != null)
    ) {
      return { ok: false, error: "Sói Tiên Tri đơn chỉ được xem tối đa một lá giữa bàn." };
    }
  }

  if (
    originalRole === "witch" &&
    (!validateCenterIndex(input.targetCenterIndex) ||
      !input.targetPlayerId ||
      !activePlayerIds.has(input.targetPlayerId))
  ) {
    return { ok: false, error: "Phù Thuỷ phải chọn một lá giữa bàn và một người nhận." };
  }

  if (originalRole === "copycat" && !isCopycatCopyTurn) {
    if (!validateCenterIndex(savedTargetCenterIndex)) {
      return { ok: false, error: "Copy Cat phải chọn một lá giữa bàn để copy." };
    }

    const copiedCard = getCenterCard(gameCards, savedTargetCenterIndex as number);
    const copiedRole = copiedCard?.original_role;

    if (!copiedRole) {
      return { ok: false, error: "Lá giữa Copy Cat chọn không hợp lệ." };
    }

    if (isCopycatCopiedRoleTurn && copiedRole !== activeNightTurn.activeRole) {
      return { ok: false, error: "Chưa tới lượt chức năng Copy Cat đã copy." };
    }

    if (copiedRole === "doppelganger") {
      if (!input.targetPlayerId || !otherPlayerIds.has(input.targetPlayerId)) {
        return { ok: false, error: "Copy Cat copy Nhan Ban phai chon mot nguoi choi khac de nhan ban." };
      }

      const nestedCopiedCard = getPlayerCard(gameCards, input.targetPlayerId);
      const nestedCopiedRole = nestedCopiedCard?.original_role;

      if (!nestedCopiedRole) {
        return { ok: false, error: "Khong tim thay chuc nang cua nguoi choi duoc nhan ban." };
      }

      if (nestedCopiedRole === "seer" && Boolean(input.targetPlayerId2)) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Tien Tri chi duoc chon la giua ban." };
      }

      if (
        nestedCopiedRole === "seer" &&
        !isSeerCenterSubmissionComplete(
          gameCards,
          input.targetCenterIndex2 ?? null,
          input.targetCenterIndex3 ?? null,
          savedTargetCenterIndex ?? null
        )
      ) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Tien Tri phai chon la giua theo thu tu." };
      }

      if (
        nestedCopiedRole === "werewolf_seer" &&
        (!input.targetPlayerId2 || !activePlayerIds.has(input.targetPlayerId2))
      ) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Soi Tien Tri phai chon mot nguoi choi de soi." };
      }

      if (nestedCopiedRole === "robber" && (!input.targetPlayerId2 || !otherPlayerIds.has(input.targetPlayerId2))) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Ke Trom phai chon mot nguoi choi khac de doi bai." };
      }

      if (
        nestedCopiedRole === "troublemaker" &&
        (!input.targetPlayerId2 ||
          !input.targetPlayerId3 ||
          input.targetPlayerId2 === input.targetPlayerId3 ||
          !otherPlayerIds.has(input.targetPlayerId2) ||
          !otherPlayerIds.has(input.targetPlayerId3))
      ) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Ke Gay Roi phai chon hai nguoi choi khac nhau." };
      }

      if (
        nestedCopiedRole === "witch" &&
        (!validateCenterIndex(input.targetCenterIndex2) ||
          !input.targetPlayerId2 ||
          !activePlayerIds.has(input.targetPlayerId2))
      ) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Phu Thuy phai chon mot la giua ban va mot nguoi nhan." };
      }

      if (nestedCopiedRole === "drunk" && !validateCenterIndex(input.targetCenterIndex2)) {
        return { ok: false, error: "Copy Cat copy Nhan Ban copy Say Ruou phai chon mot la giua ban." };
      }

      if (nestedCopiedRole === "werewolf" || nestedCopiedRole === "werewolf_seer") {
        // Copy Cat copy trúng lá Nhân Bản giữa bàn, Nhân Bản đó lại copy trúng Sói: người giữ lá
        // Sói gốc vẫn còn đó CỘNG THÊM Copy Cat (giờ là Nhân Bản → Sói), nên luôn có từ 2 Ma Sói
        // trở lên — không bao giờ rơi vào trường hợp "sói đơn" được xem thêm lá giữa bàn.
        if (input.targetCenterIndex2 != null || input.targetCenterIndex3 != null) {
          return {
            ok: false,
            error: `Có từ 2 Ma Sói trở lên nên Copy Cat copy Nhân Bản copy ${WOLF_ROLE_LABELS[nestedCopiedRole]} không được xem lá giữa bàn.`,
          };
        }
      }

      if (nestedCopiedRole === "copycat") {
        input.targetPlayerId2 = null;
        input.targetPlayerId3 = null;
        input.targetCenterIndex2 = null;
        input.targetCenterIndex3 = null;
      }
    }

    if (copiedRole === "werewolf" || copiedRole === "werewolf_seer") {
      const werewolfCount = getWerewolfPlayerIdsAfterCopycat(gameCards, gameActions).length;
      const copiedRoleLabel = WOLF_ROLE_LABELS[copiedRole];

      if (werewolfCount > 1 && (input.targetCenterIndex2 != null || input.targetCenterIndex3 != null)) {
        return {
          ok: false,
          error: `Có từ 2 Ma Sói trở lên nên Copy Cat copy ${copiedRoleLabel} không được xem lá giữa bàn.`,
        };
      }

      if (
        werewolfCount === 1 &&
        ((input.targetCenterIndex2 != null &&
          (!validateCenterIndex(input.targetCenterIndex2) ||
            input.targetCenterIndex2 === savedTargetCenterIndex)) ||
          input.targetCenterIndex3 != null)
      ) {
        return {
          ok: false,
          error: `Copy Cat copy ${copiedRoleLabel} khi là sói đơn chỉ được xem tối đa một lá giữa bàn khác lá đã copy.`,
        };
      }
    }

    if (copiedRole === "robber" && (!input.targetPlayerId || !otherPlayerIds.has(input.targetPlayerId))) {
      return { ok: false, error: "Copy Cat copy Kẻ Trộm phải chọn một người chơi khác." };
    }

    if (
      copiedRole === "troublemaker" &&
      (!input.targetPlayerId ||
        !input.targetPlayerId2 ||
        input.targetPlayerId === input.targetPlayerId2 ||
        !otherPlayerIds.has(input.targetPlayerId) ||
        !otherPlayerIds.has(input.targetPlayerId2))
    ) {
      return { ok: false, error: "Copy Cat copy Kẻ Gây Rối phải chọn hai người chơi khác nhau." };
    }

    if (
      copiedRole === "witch" &&
      (!validateCenterIndex(input.targetCenterIndex2) ||
        !input.targetPlayerId ||
        !activePlayerIds.has(input.targetPlayerId))
    ) {
      return { ok: false, error: "Copy Cat copy Phù Thuỷ phải chọn lá giữa phụ và người nhận." };
    }

    if (copiedRole === "drunk" && !validateCenterIndex(input.targetCenterIndex2)) {
      return { ok: false, error: "Copy Cat copy Say Rượu phải chọn lá giữa phụ để đổi." };
    }

    if (copiedRole === "seer") {
      if (Boolean(input.targetPlayerId)) {
        return { ok: false, error: "Copy Cat copy Tiên Tri chỉ được chọn lá giữa bàn." };
      }

      if (
        !isSeerCenterSubmissionComplete(
          gameCards,
          input.targetCenterIndex2 ?? null,
          input.targetCenterIndex3 ?? null,
          savedTargetCenterIndex ?? null
        )
      ) {
        return { ok: false, error: "Copy Cat copy Tiên Tri phải chọn lá giữa khác lá đã copy, và dừng ngay nếu lần đầu thấy Sói." };
      }
    }

    if (copiedRole === "werewolf_seer" && (!input.targetPlayerId || !activePlayerIds.has(input.targetPlayerId))) {
      return { ok: false, error: "Copy Cat copy Sói Tiên Tri phải chọn một người chơi để soi." };
    }
  }

  if (isCopycatCopiedRoleTurn) {
    const { error: resetConfirmationError } = await supabase
      .from("game_phase_confirmations")
      .delete()
      .eq("game_id", room.current_game_id)
      .eq("player_id", currentPlayer.id)
      .eq("phase", "night");

    if (resetConfirmationError) {
      return { ok: false, error: "Không thể chuẩn bị lượt chức năng Copy Cat." };
    }
  }

  const copycatCopiedWerewolfTurn =
    isCopycatCopiedRoleTurn && activeNightTurn.activeRole === "werewolf";
  const submittedActionPayload = {
    game_id: room.current_game_id,
    player_id: currentPlayer.id,
    action_type: originalRole,
    target_player_id: input.targetPlayerId ?? null,
    target_player_id_2:
      copycatCopiedWerewolfTurn &&
      !input.targetPlayerId2 &&
      !validateCenterIndex(input.targetCenterIndex2)
        ? currentPlayer.id
        : input.targetPlayerId2 ?? null,
    target_player_id_3: input.targetPlayerId3 ?? null,
    target_center_index: savedTargetCenterIndex ?? null,
    target_center_index_2: input.targetCenterIndex2 ?? null,
    target_center_index_3: input.targetCenterIndex3 ?? null,
  };
  const submittedAction = {
    id: existingAction?.id ?? "",
    ...submittedActionPayload,
  } satisfies ActionRow;
  const submittedActiveNightTurn =
    originalRole === "doppelganger"
      ? {
          ...activeNightTurn,
          copiedRole: getDoppelgangerCopiedRole(gameCards, submittedAction),
        }
      : originalRole === "copycat" &&
        activeNightTurn.isCopycatCopiedRole &&
        activeNightTurn.activeRole === "doppelganger"
        ? {
            ...activeNightTurn,
            copiedRole: getCopycatDoppelgangerCopiedRole(gameCards, submittedAction),
          }
      : activeNightTurn;

  const { error } = await supabase
    .from("game_actions")
    .upsert(
      submittedActionPayload,
      { onConflict: "game_id,player_id" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu hành động ban đêm." };
  }

  if (!doesNightTurnRequireResultConfirmation(submittedActiveNightTurn, submittedAction, gameCards)) {
    const { error: confirmationError } = await supabase
      .from("game_phase_confirmations")
      .upsert(
        {
          game_id: room.current_game_id,
          player_id: currentPlayer.id,
          phase: "night",
        },
        { onConflict: "game_id,player_id,phase" }
      );

    if (confirmationError) {
      return { ok: false, error: "Không thể xác nhận hoàn tất lượt đêm." };
    }
  }

  await maybeAutoAdvancePhase(supabase, room, players, "night");
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function confirmWolfNightActionResult(roomCode: string): Promise<WolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const { data: game } = await supabase
    .from("game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game || game.phase !== "night") {
    return { ok: false, error: "Không còn ở giai đoạn ban đêm." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  const { data: cardsData } = await supabase
    .from("game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const { data: actionsData } = await supabase
    .from("game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_player_id_3, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", room.current_game_id);
  const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, "night");
  const confirmedNightPlayerIds = new Set(confirmations.map((confirmation) => confirmation.player_id));
  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const activeNightTurn = getActiveNightTurn(players, cards, actions, confirmedNightPlayerIds);
  const myAction = actions.find((action) => action.player_id === currentPlayer.id) ?? null;

  if (!activeNightTurn || activeNightTurn.playerId !== currentPlayer.id) {
    return { ok: false, error: "Chưa tới lượt xác nhận của bạn." };
  }

  if (!isNightTurnActionSubmitted(activeNightTurn, myAction, cards)) {
    return { ok: false, error: "Bạn cần hoàn tất hành động trước khi xác nhận kết quả." };
  }

  const { error } = await supabase
    .from("game_phase_confirmations")
    .upsert(
      {
        game_id: room.current_game_id,
        player_id: currentPlayer.id,
        phase: "night",
      },
      { onConflict: "game_id,player_id,phase" }
    );

  if (error) {
    return { ok: false, error: "Không thể xác nhận kết quả lượt đêm." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, "night");
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function submitWolfPhaseConfirmation(roomCode: string): Promise<WolfMutationResult> {
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

  const { data: game } = await supabase
    .from("game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game || !isConfirmablePhase(game.phase)) {
    return { ok: false, error: "Giai đoạn này không cần xác nhận." };
  }

  const { error } = await supabase
    .from("game_phase_confirmations")
    .upsert(
      {
        game_id: game.id,
        player_id: currentPlayer.id,
        phase: game.phase,
      },
      { onConflict: "game_id,player_id,phase" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu trạng thái hoàn tất." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, game.phase);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function advanceWolfPhase(roomCode: string): Promise<WolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được chuyển giai đoạn." };
  }

  const { data: game } = await supabase
    .from("game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (game.phase === "card_reveal") {
    await supabase.from("game_sessions").update({ phase: "night" }).eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "night") {
    await resolveNightActions(game.id);
    await supabase
      .from("game_sessions")
      .update({
        phase: "discussion",
        discussion_ends_at: null,
      })
      .eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "discussion") {
    await supabase.from("game_sessions").update({ phase: "voting" }).eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "voting") {
    await setWolfGameResultPhase(supabase, game.id, room.code, players);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  return { ok: false, error: "Ván đã kết thúc." };
}

export async function submitWolfVote(
  roomCode: string,
  targetPlayerId?: string | null
): Promise<WolfMutationResult> {
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

  const { data: game } = await supabase
    .from("game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game || game.phase !== "voting") {
    return { ok: false, error: "Chưa đến giai đoạn bỏ phiếu." };
  }

  if (targetPlayerId && !players.some((player) => player.id === targetPlayerId)) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
  }

  const { error } = await supabase
    .from("game_votes")
    .upsert(
      {
        game_id: game.id,
        voter_player_id: currentPlayer.id,
        target_player_id: targetPlayerId ?? null,
        is_skip: !targetPlayerId,
      },
      { onConflict: "game_id,voter_player_id" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu phiếu bầu." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, "voting");
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}

export async function finishWolfGame(roomCode: string): Promise<WolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (!room.current_game_id) {
    return { ok: true };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!currentPlayer) {
    return { ok: false, error: "Bạn chưa ở trong phòng này." };
  }

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được đưa mọi người về phòng chờ." };
  }

  await supabase
    .from("rooms")
    .update({ status: "waiting", current_game_id: null })
    .eq("id", room.id);
  await supabase
    .from("room_players")
    .update({ is_ready: false })
    .eq("room_id", room.id)
    .eq("is_host", false);

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}
