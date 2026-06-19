"use server";

import { cookies } from "next/headers";
import { safeBroadcastWolfPlayUpdate, safeBroadcastWolfRoomUpdate } from "@/lib/pusher/server";
import { normalizePlayerAvatarKey } from "@/lib/player-avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WolfGamePhase, WolfRole, WolfRoomStatus } from "@/lib/supabase/types";
import { WOLF_PLAYER_SESSION_COOKIE } from "@/lib/wolf-session";
import { WOLF_ROLE_LABELS } from "@/lib/wolf-game";

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const MAX_PLAYERS = 10;
const DISCUSSION_DURATION_MS = 5 * 60 * 1000;

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
  "copycat",
];

const ROLE_RESOLUTION_ORDER: WolfRole[] = [
  "copycat",
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
  copycat: 1,
};

type RoomRow = {
  id: string;
  code: string;
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
      role: WolfRole;
    }
  | {
      ok: false;
      error: string;
    };

export type WolfCenterCardState = {
  index: number;
  role: WolfRole | null;
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
  } | null;
  werewolfTeammates: Array<{
    playerId: string;
    playerName: string;
  }>;
  centerCards: WolfCenterCardState[];
  myAction: {
    actionType: string;
    targetPlayerId: string | null;
    targetPlayerId2: string | null;
    targetCenterIndex: number | null;
    targetCenterIndex2: number | null;
    targetCenterIndex3: number | null;
  } | null;
  myVoteTargetPlayerId: string | null;
  isCurrentPlayerPhaseReady: boolean;
  phaseReadyPlayerIds: string[];
  nightReviewMessages: string[];
  allNightActionsSubmitted: boolean;
  allVotesSubmitted: boolean;
  allPhaseConfirmationsSubmitted: boolean;
  result: WolfGameResult | null;
  cardMovementSummary: WolfCardMovementSummary | null;
  allPlayersSummary: Array<{
    playerId: string;
    playerName: string;
    originalRole: WolfRole;
    finalRole: WolfRole;
  }> | null;
  roleDeck: WolfRole[];
};

export type WolfNightActionInput = {
  actionType: string;
  targetPlayerId?: string | null;
  targetPlayerId2?: string | null;
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

function isMissingAvatarKeyError(error?: DatabaseMutationError | null) {
  if (!error) {
    return false;
  }

  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  return errorText.includes("avatar_key");
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
    .from("wolf_rooms")
    .select("id, code, status, host_player_id, current_game_id")
    .eq("code", normalizeRoomCode(roomCode))
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

  return supabase
    .from("wolf_room_players")
    .insert(fallbackValues)
    .select("id")
    .single();
}

async function updateWolfRoomPlayerIdentity(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string,
  name: string,
  avatarKey: string
) {
  const { error } = await supabase
    .from("wolf_room_players")
    .update({ name, avatar_key: avatarKey })
    .eq("id", playerId);

  if (!isMissingAvatarKeyError(error)) {
    return error;
  }

  const { error: fallbackError } = await supabase
    .from("wolf_room_players")
    .update({ name })
    .eq("id", playerId);

  return fallbackError;
}

function mapLobbyPlayer(player: PlayerRow): WolfLobbyPlayer {
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

function getCenterCard(cards: CardRow[], centerIndex: number) {
  return cards.find((card) => card.center_index === centerIndex) ?? null;
}

function validateCenterIndex(centerIndex?: number | null) {
  return typeof centerIndex === "number" && centerIndex >= 0 && centerIndex <= 2;
}

function isWerewolfRole(role?: WolfRole | null) {
  return role === "werewolf" || role === "werewolf_seer";
}

function getOriginalWerewolfPlayerIds(cards: CardRow[]) {
  return cards
    .filter((card) => card.player_id && isWerewolfRole(card.original_role))
    .map((card) => card.player_id as string);
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
    if (action.target_player_id) {
      const targetCard = getPlayerCard(cards, action.target_player_id);

      return [
        `Bạn đã soi ${getPlayerName(players, action.target_player_id)}: ${getRoleReviewLabel(
          targetCard?.original_role
        )}.`,
      ];
    }

    const centerIndexes = [action.target_center_index, action.target_center_index_2].filter(
      validateCenterIndex
    ) as number[];
    const revealedCards = centerIndexes.map((centerIndex) => {
      const centerCard = getCenterCard(cards, centerIndex);

      return `Lá giữa ${centerIndex + 1}: ${getRoleReviewLabel(centerCard?.original_role)}`;
    });

    return revealedCards.length > 0 ? [`Bạn đã soi ${revealedCards.join(", ")}.`] : ["Bạn chưa chọn lá để soi."];
  }

  if (action.action_type === "werewolf_seer") {
    if (action.target_player_id) {
      const targetCard = getPlayerCard(cards, action.target_player_id);

      return [
        `Bạn đã soi ${getPlayerName(players, action.target_player_id)}: ${getRoleReviewLabel(
          targetCard?.original_role
        )}.`,
      ];
    }

    return ["Sói Tiên Tri chưa chọn người chơi để soi."];
  }

  if (action.action_type === "werewolf") {
    const werewolfTeammateNames = getOriginalWerewolfPlayerIds(cards)
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
        ? `Bạn đã mở lá giữa ${(action.target_center_index as number) + 1} và gán chức năng đó cho ${getPlayerName(
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

    return [`Sau ban đêm, bài hiện tại của bạn là ${getRoleReviewLabel(myCard?.current_role)}.`];
  }

  if (action.action_type === "copycat") {
    if (!validateCenterIndex(action.target_center_index)) {
      return ["Copy Cat chưa chọn lá giữa để copy."];
    }

    const copiedCard = getCenterCard(cards, action.target_center_index as number);
    const copiedRole = copiedCard ? getRoleReviewLabel(copiedCard.original_role) : "không rõ";

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

  return ["Vai trò của bạn không có quyền xem thêm kết quả ban đêm."];
}

function isConfirmablePhase(phase: WolfGamePhase) {
  return phase === "card_reveal" || phase === "night_review" || phase === "discussion";
}

async function getPhaseConfirmations(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  gameId: string,
  phase: WolfGamePhase
) {
  const { data } = await supabase
    .from("wolf_game_phase_confirmations")
    .select("id, game_id, player_id, phase")
    .eq("game_id", gameId)
    .eq("phase", phase);

  return (data ?? []) as PhaseConfirmationRow[];
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
        .from("wolf_game_sessions")
        .update({ phase: "night" })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "night") {
    const { data: actionsData } = await supabase
      .from("wolf_game_actions")
      .select("player_id")
      .eq("game_id", room.current_game_id);
    const actionPlayerIds = new Set((actionsData ?? []).map((action) => action.player_id));

    if (players.every((player) => actionPlayerIds.has(player.id))) {
      await resolveNightActions(room.current_game_id);
      await supabase
        .from("wolf_game_sessions")
        .update({ phase: "night_review" })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "night_review") {
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, phase);

    if (confirmations.length >= players.length) {
      await supabase
        .from("wolf_game_sessions")
        .update({
          phase: "discussion",
          discussion_ends_at: new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString(),
        })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "discussion") {
    const confirmations = await getPhaseConfirmations(supabase, room.current_game_id, phase);
    const { data: game } = await supabase
      .from("wolf_game_sessions")
      .select("discussion_ends_at")
      .eq("id", room.current_game_id)
      .maybeSingle();
    const discussionExpired = game?.discussion_ends_at
      ? new Date(game.discussion_ends_at).getTime() <= Date.now()
      : false;

    if (discussionExpired || confirmations.length >= players.length) {
      await supabase
        .from("wolf_game_sessions")
        .update({ phase: "voting" })
        .eq("id", room.current_game_id);
    }

    return;
  }

  if (phase === "voting") {
    const { data: votesData } = await supabase
      .from("wolf_game_votes")
      .select("voter_player_id")
      .eq("game_id", room.current_game_id);
    const votePlayerIds = new Set((votesData ?? []).map((vote) => vote.voter_player_id));

    if (players.every((player) => votePlayerIds.has(player.id))) {
      await supabase
        .from("wolf_game_sessions")
        .update({ phase: "result" })
        .eq("id", room.current_game_id);
    }
  }
}

function buildGameResult(players: PlayerRow[], cards: CardRow[], votes: VoteRow[]): WolfGameResult {
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
  const everyoneHasOneVote =
    votes.length === players.length && voteCounts.every((voteCount) => voteCount.votes === 1);
  const eliminatedPlayerIds =
    maxVotes > 0 && !everyoneHasOneVote
      ? voteCounts
          .filter((voteCount) => voteCount.votes === maxVotes)
          .map((voteCount) => voteCount.playerId)
      : [];
  const finalRoleByPlayerId = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card.current_role])
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

function simulateNightResolution(
  cards: CardRow[],
  actions: ActionRow[],
  players: PlayerRow[] = []
): {
  currentRoleByCardId: Map<string, WolfRole>;
  cardMovementSummary: WolfCardMovementSummary;
  immediateRoleRevealByPlayerId: Map<string, WolfRole>;
} {
  const actionByPlayerId = new Map(actions.map((action) => [action.player_id, action]));
  const currentRoleByCardId = new Map(cards.map((card) => [card.id, card.original_role]));
  const immediateRoleRevealByPlayerId = new Map<string, WolfRole>();
  const steps: WolfCardMovementStep[] = [];
  let stepNumber = 1;

  const roleOfCard = (card: CardRow) => currentRoleByCardId.get(card.id) ?? card.original_role;
  const assignRole = (card: CardRow | null, nextRole: WolfRole) => {
    if (!card) {
      return;
    }

    currentRoleByCardId.set(card.id, nextRole);
  };
  const swapCards = (cardA: CardRow | null, cardB: CardRow | null) => {
    if (!cardA || !cardB) {
      return;
    }

    const roleA = roleOfCard(cardA);
    currentRoleByCardId.set(cardA.id, roleOfCard(cardB));
    currentRoleByCardId.set(cardB.id, roleA);
  };

  for (const role of ROLE_RESOLUTION_ORDER) {
    const roleCards = cards.filter((card) => card.player_id && card.original_role === role);

    for (const card of roleCards) {
      const action = actionByPlayerId.get(card.player_id as string);

      if (!action) {
        continue;
      }

      if (role === "werewolf") {
        const actorName = getPlayerName(players, card.player_id);
        const werewolfTeammateNames = getOriginalWerewolfPlayerIds(cards)
          .filter((playerId) => playerId !== card.player_id)
          .map((playerId) => getPlayerName(players, playerId));

        if (werewolfTeammateNames.length > 0) {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) thấy Ma Sói cùng phe: ${werewolfTeammateNames.join(", ")}`,
            description: `${actorName} có đồng đội Ma Sói nên không xem lá giữa bàn trong lượt này.`,
          });
          stepNumber += 1;
        } else if (validateCenterIndex(action.target_center_index)) {
          const centerCard = getCenterCard(cards, action.target_center_index as number);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) xem ${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard?.original_role)})`,
            description: `${actorName} là Ma Sói đơn nên được xem một lá giữa bàn. Hành động này không làm đổi vị trí lá bài.`,
          });
          stepNumber += 1;
        } else {
          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) hoàn tất lượt mà không xem lá giữa bàn`,
            description: `${actorName} không chọn xem lá giữa bàn trong lượt Ma Sói. Hành động này không làm đổi vị trí lá bài.`,
          });
          stepNumber += 1;
        }
      }

      if (role === "werewolf_seer" && action.target_player_id) {
        const actorName = getPlayerName(players, card.player_id);
        const targetCard = getPlayerCard(cards, action.target_player_id);
        const targetName = getPlayerName(players, action.target_player_id);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) soi ${targetName} (${getRoleReviewLabel(targetCard?.original_role)})`,
          description: `${actorName} xem bài ban đầu của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
        });
        stepNumber += 1;
      }

      if (role === "seer") {
        const actorName = getPlayerName(players, card.player_id);

        if (action.target_player_id) {
          const targetCard = getPlayerCard(cards, action.target_player_id);
          const targetName = getPlayerName(players, action.target_player_id);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) soi ${targetName} (${getRoleReviewLabel(targetCard?.original_role)})`,
            description: `${actorName} xem bài ban đầu của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
          });
          stepNumber += 1;
        } else {
          const centerIndexes = [action.target_center_index, action.target_center_index_2].filter(
            validateCenterIndex
          ) as number[];
          const revealedCenters = centerIndexes.map((centerIndex) => {
            const centerCard = getCenterCard(cards, centerIndex);

            return `${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard?.original_role)})`;
          });

          if (revealedCenters.length > 0) {
            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
              logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) soi ${revealedCenters.join(" và ")}`,
              description: `${actorName} xem các lá giữa đã chọn. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
            });
            stepNumber += 1;
          }
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
          description: `${actorName} chọn ${getCardHolderLabel(copiedCenterCard, players)} và thực hiện ngay chức năng của ${WOLF_ROLE_LABELS[copiedRole]}.`,
        });
        stepNumber += 1;

        if (copiedRole === "seer") {
          if (action.target_player_id) {
            const targetCard = getPlayerCard(cards, action.target_player_id);
            const targetName = getPlayerName(players, action.target_player_id);

            steps.push({
              id: `${role}-${card.player_id}-${stepNumber}`,
              title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
              logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) soi ${targetName} (${getRoleReviewLabel(targetCard?.original_role)})`,
              description: `${actorName} xem bài ban đầu của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
            });
            stepNumber += 1;
          } else {
            const centerIndexes = [action.target_center_index_2, action.target_center_index_3].filter(
              validateCenterIndex
            ) as number[];
            const revealedCenters = centerIndexes.map((centerIndex) => {
              const centerCard = getCenterCard(cards, centerIndex);

              return `${getCardHolderLabel(centerCard, players)} (${getRoleReviewLabel(centerCard?.original_role)})`;
            });

            if (revealedCenters.length > 0) {
              steps.push({
                id: `${role}-${card.player_id}-${stepNumber}`,
                title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
                logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) soi ${revealedCenters.join(" và ")}`,
                description: `${actorName} xem các lá giữa đã chọn sau lá dùng để copy. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
              });
              stepNumber += 1;
            }
          }
        }

        if (copiedRole === "werewolf_seer" && action.target_player_id) {
          const targetCard = getPlayerCard(cards, action.target_player_id);
          const targetName = getPlayerName(players, action.target_player_id);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) soi ${targetName} (${getRoleReviewLabel(targetCard?.original_role)})`,
            description: `${actorName} xem bài ban đầu của ${targetName}. Hành động này chỉ tiết lộ thông tin, không đổi lá bài.`,
          });
          stepNumber += 1;
        }

        if (copiedRole === "robber" && action.target_player_id) {
          const targetCard = getPlayerCard(cards, action.target_player_id);

          if (!targetCard) {
            continue;
          }

          const targetName = getCardHolderLabel(targetCard, players);
          const actorRoleBefore = roleOfCard(card);
          const targetRoleBefore = roleOfCard(targetCard);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) đổi bài với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
            description: `${actorName} đang giữ lá ${getRoleReviewLabel(actorRoleBefore)} và ${targetName} đang giữ lá ${getRoleReviewLabel(targetRoleBefore)}. Hai lá được đổi chỗ.`,
          });
          stepNumber += 1;
          immediateRoleRevealByPlayerId.set(card.player_id as string, targetRoleBefore);
          swapCards(card, targetCard);
        }

        if (copiedRole === "troublemaker" && action.target_player_id && action.target_player_id_2) {
          const firstTargetCard = getPlayerCard(cards, action.target_player_id);
          const secondTargetCard = getPlayerCard(cards, action.target_player_id_2);

          if (!firstTargetCard || !secondTargetCard) {
            continue;
          }

          const firstTargetName = getCardHolderLabel(firstTargetCard, players);
          const secondTargetName = getCardHolderLabel(secondTargetCard, players);
          const firstRoleBefore = roleOfCard(firstTargetCard);
          const secondRoleBefore = roleOfCard(secondTargetCard);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) đổi bài của ${firstTargetName} (${getRoleReviewLabel(firstRoleBefore)}) với ${secondTargetName} (${getRoleReviewLabel(secondRoleBefore)})`,
            description: `${firstTargetName} và ${secondTargetName} được đổi chỗ hai lá đang giữ tại thời điểm Copy Cat thực hiện.`,
          });
          stepNumber += 1;
          swapCards(firstTargetCard, secondTargetCard);
        }

        if (copiedRole === "witch" && validateCenterIndex(action.target_center_index_2) && action.target_player_id) {
          const centerCard = getCenterCard(cards, action.target_center_index_2 as number);
          const targetCard = getPlayerCard(cards, action.target_player_id);

          if (!centerCard || !targetCard) {
            continue;
          }

          const centerLabel = getCardHolderLabel(centerCard, players);
          const targetName = getCardHolderLabel(targetCard, players);
          const centerRoleBefore = roleOfCard(centerCard);
          const targetRoleBefore = roleOfCard(targetCard);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) gán chức năng ${getRoleReviewLabel(centerRoleBefore)} từ ${centerLabel} cho ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
            description: `${targetName} nhận chức năng ${getRoleReviewLabel(centerRoleBefore)} từ ${centerLabel}. ${centerLabel} vẫn ở giữa bàn; chức năng cũ ${getRoleReviewLabel(targetRoleBefore)} của ${targetName} không được chuyển vào giữa.`,
          });
          stepNumber += 1;
          assignRole(targetCard, centerRoleBefore);
        }

        if (copiedRole === "drunk" && validateCenterIndex(action.target_center_index_2)) {
          const centerCard = getCenterCard(cards, action.target_center_index_2 as number);

          if (!centerCard) {
            continue;
          }

          const actorRoleBefore = roleOfCard(card);
          const centerRoleBefore = roleOfCard(centerCard);
          const centerLabel = getCardHolderLabel(centerCard, players);

          steps.push({
            id: `${role}-${card.player_id}-${stepNumber}`,
            title: `Bước ${stepNumber}: ${actorName} thực hiện ${WOLF_ROLE_LABELS[copiedRole]}`,
            logText: `${actorName} (${WOLF_ROLE_LABELS[role]} → ${WOLF_ROLE_LABELS[copiedRole]}) đổi bài với ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)})`,
            description: `Lá ${getRoleReviewLabel(actorRoleBefore)} của ${actorName} đi vào ${centerLabel}; lá ${getRoleReviewLabel(centerRoleBefore)} chuyển cho ${actorName}.`,
          });
          stepNumber += 1;
          swapCards(card, centerCard);
        }
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
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) đổi bài với ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
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
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) đổi bài của ${firstTargetName} (${getRoleReviewLabel(firstRoleBefore)}) với ${secondTargetName} (${getRoleReviewLabel(secondRoleBefore)})`,
          description: `Ở thời điểm ${actorName} hành động, ${firstTargetName} đang giữ lá ${getRoleReviewLabel(firstRoleBefore)} và ${secondTargetName} đang giữ lá ${getRoleReviewLabel(secondRoleBefore)}. ${actorName} đổi chỗ hai lá này: lá ${getRoleReviewLabel(firstRoleBefore)} chuyển sang ${secondTargetName}, còn lá ${getRoleReviewLabel(secondRoleBefore)} chuyển sang ${firstTargetName}.`,
        });
        stepNumber += 1;
        swapCards(firstTargetCard, secondTargetCard);
      }

      if (role === "witch" && validateCenterIndex(action.target_center_index) && action.target_player_id) {
        const centerCard = getCenterCard(cards, action.target_center_index as number);
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
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) gán chức năng ${getRoleReviewLabel(centerRoleBefore)} từ ${centerLabel} cho ${targetName} (${getRoleReviewLabel(targetRoleBefore)})`,
          description: `${targetName} nhận chức năng ${getRoleReviewLabel(centerRoleBefore)} từ ${centerLabel}. ${centerLabel} vẫn ở giữa bàn; chức năng cũ ${getRoleReviewLabel(targetRoleBefore)} của ${targetName} không được chuyển vào giữa.`,
        });
        stepNumber += 1;
        assignRole(targetCard, centerRoleBefore);
      }

      if (role === "drunk" && validateCenterIndex(action.target_center_index)) {
        const centerCard = getCenterCard(cards, action.target_center_index as number);

        if (!centerCard) {
          continue;
        }

        const actorName = getPlayerName(players, card.player_id);
        const actorRoleBefore = roleOfCard(card);
        const centerRoleBefore = roleOfCard(centerCard);
        const centerLabel = getCardHolderLabel(centerCard, players);

        steps.push({
          id: `${role}-${card.player_id}-${stepNumber}`,
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) đổi bài với ${centerLabel} (${getRoleReviewLabel(centerRoleBefore)})`,
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
          title: `Bước ${stepNumber}: ${actorName} hành động bằng vai ban đầu ${WOLF_ROLE_LABELS[role]}`,
          logText: `${actorName} (${WOLF_ROLE_LABELS[role]}) xem lại bài hiện tại: ${getRoleReviewLabel(currentRole)}`,
          description: `${actorName} xem lá mình đang giữ sau khi các hành động đổi bài trước đó đã được xử lý.`,
        });
        stepNumber += 1;
      }
    }
  }

  return {
    currentRoleByCardId,
    cardMovementSummary: {
      orderText:
        steps.length > 0
          ? `Log được xử lý theo vai ban đầu của từng người chơi. Thứ tự hành động trong đêm là ${getNightActionResolutionOrderText()}.`
          : `Đêm này không có vai nào thực hiện hành động. Nếu có hành động, hệ thống sẽ xử lý theo vai ban đầu với thứ tự ${getNightActionResolutionOrderText()}.`,
      steps,
    },
    immediateRoleRevealByPlayerId,
  };
}

async function resolveNightActions(gameId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: cardsData } = await supabase
    .from("wolf_game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", gameId);
  const { data: actionsData } = await supabase
    .from("wolf_game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", gameId);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const { currentRoleByCardId } = simulateNightResolution(cards, actions);

  await Promise.all(
    cards.map((card) =>
      supabase
        .from("wolf_game_cards")
        .update({ current_role: currentRoleByCardId.get(card.id) ?? card.original_role })
        .eq("id", card.id)
    )
  );
}

export async function createWolfRoom(
  playerName?: string,
  avatarKey?: string
): Promise<WolfActionResult> {
  const supabase = createSupabaseAdminClient();
  const sessionId = await getOrCreatePlayerSessionId();
  const name = normalizePlayerName(playerName);
  const playerAvatarKey = normalizePlayerAvatarKey(avatarKey);

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

    const { data: hostPlayer, error: playerError } = await insertWolfRoomPlayer(
      supabase,
      {
        room_id: room.id,
        session_id: sessionId,
        name,
        avatar_key: playerAvatarKey,
        is_host: true,
        is_ready: true,
      }
    );

    if (playerError || !hostPlayer) {
      await supabase.from("wolf_rooms").delete().eq("id", room.id);
      return { ok: false, error: "Không thể thêm người chơi vào phòng." };
    }

    await supabase
      .from("wolf_rooms")
      .update({ host_player_id: hostPlayer.id })
      .eq("id", room.id);

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

export async function joinWolfRoom(
  roomCode: string,
  playerName?: string,
  avatarKey?: string
): Promise<WolfActionResult> {
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
    .select("id, code, status, host_player_id, current_game_id")
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
    if (room.status !== "playing" || !room.current_game_id) {
      return { ok: false, error: "Phòng này đã bắt đầu hoặc đã kết thúc." };
    }

    const { data: game } = await supabase
      .from("wolf_game_sessions")
      .select("phase")
      .eq("id", room.current_game_id)
      .maybeSingle();

    if (game?.phase !== "result") {
      return { ok: false, error: "Phòng này đang chơi. Hãy chờ ván hiện tại kết thúc." };
    }

    await supabase
      .from("wolf_rooms")
      .update({ status: "waiting", current_game_id: null })
      .eq("id", room.id);
    await supabase
      .from("wolf_room_players")
      .update({ is_ready: false })
      .eq("room_id", room.id)
      .eq("is_host", false);
    room.status = "waiting";
    room.current_game_id = null;
  }

  const { data: existingPlayer } = await supabase
    .from("wolf_room_players")
    .select("id")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingPlayer) {
    await updateWolfRoomPlayerIdentity(supabase, existingPlayer.id, name, playerAvatarKey);

    await safeBroadcastWolfRoomUpdate(room.code);

    return {
      ok: true,
      roomCode: room.code,
      playerId: existingPlayer.id,
      playerName: name,
      playerAvatarKey,
    };
  }

  const { count: activePlayerCount } = await supabase
    .from("wolf_room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((activePlayerCount ?? 0) >= MAX_PLAYERS) {
    return { ok: false, error: "Phòng đã đủ người." };
  }

  const { data: player, error: playerError } = await insertWolfRoomPlayer(
    supabase,
    {
      room_id: room.id,
      session_id: sessionId,
      name,
      avatar_key: playerAvatarKey,
    }
  );

  if (playerError || !player) {
    return { ok: false, error: "Không thể vào phòng. Vui lòng thử lại." };
  }

  await safeBroadcastWolfRoomUpdate(room.code);

  return {
    ok: true,
    roomCode: room.code,
    playerId: player.id,
    playerName: name,
    playerAvatarKey,
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
    .from("wolf_rooms")
    .select("id, code, status, host_player_id, current_game_id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return;
  }

  if (room.status !== "waiting") {
    if (room.status !== "playing" || !room.current_game_id) {
      return;
    }

    const { data: game } = await supabase
      .from("wolf_game_sessions")
      .select("phase")
      .eq("id", room.current_game_id)
      .maybeSingle();

    if (game?.phase !== "result") {
      return;
    }
  }

  const { data: player } = await supabase
    .from("wolf_room_players")
    .select("id, is_host")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!player) {
    return;
  }

  await supabase
    .from("wolf_room_players")
    .delete()
    .eq("id", player.id);

  if (!player.is_host) {
    await safeBroadcastWolfRoomUpdate(room.code);
    return;
  }

  const { data: nextHost } = await supabase
    .from("wolf_room_players")
    .select("id")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextHost) {
    await supabase
      .from("wolf_rooms")
      .update({ host_player_id: null, status: "finished", current_game_id: null })
      .eq("id", room.id);
    await safeBroadcastWolfRoomUpdate(room.code);
    return;
  }

  await supabase
    .from("wolf_room_players")
    .update({ is_host: true, is_ready: true })
    .eq("id", nextHost.id);
  await supabase
    .from("wolf_rooms")
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
    .from("wolf_room_players")
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
    .from("wolf_rooms")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return;
  }

  const { data: player } = await supabase
    .from("wolf_room_players")
    .select("id, is_ready, is_host")
    .eq("room_id", room.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!player || player.is_host) {
    return;
  }

  await supabase
    .from("wolf_room_players")
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
    .from("wolf_rooms")
    .select("id, code, status, host_player_id, current_game_id")
    .eq("code", code)
    .maybeSingle();

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

export async function getWolfSpectatorState(roomCode: string): Promise<WolfSpectatorState | null> {
  const code = normalizeRoomCode(roomCode);

  if (!ROOM_CODE_PATTERN.test(code)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data: room } = await supabase
    .from("wolf_rooms")
    .select("id, code, status, host_player_id, current_game_id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return null;
  }

  const players = await getActivePlayers(supabase, room);
  let game: GameRow | null = null;
  let result: WolfGameResult | null = null;

  if (room.current_game_id) {
    const { data: gameData } = await supabase
      .from("wolf_game_sessions")
      .select("id, room_id, phase, round_number, discussion_ends_at")
      .eq("id", room.current_game_id)
      .maybeSingle();

    game = (gameData ?? null) as GameRow | null;

    if (game?.phase === "result") {
      const { data: cardsData } = await supabase
        .from("wolf_game_cards")
        .select("id, game_id, player_id, center_index, original_role, current_role")
        .eq("game_id", game.id);
      const { data: votesData } = await supabase
        .from("wolf_game_votes")
        .select("id, game_id, voter_player_id, target_player_id, is_skip")
        .eq("game_id", game.id);

      result = buildGameResult(players, (cardsData ?? []) as CardRow[], (votesData ?? []) as VoteRow[]);
    }
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.host_player_id,
      currentGameId: room.current_game_id ?? null,
    },
    players: players.map(mapLobbyPlayer),
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

  const unreadyPlayer = players.find((player) => !player.is_host && !player.is_ready);

  if (unreadyPlayer) {
    return { ok: false, error: "Còn người chơi chưa sẵn sàng." };
  }

  const roleDeckValidation = validateSelectedRoleDeck(selectedRoles, players.length + 3);

  if (!roleDeckValidation.ok) {
    return roleDeckValidation;
  }

  const { data: game, error: gameError } = await supabase
    .from("wolf_game_sessions")
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
    .from("wolf_game_cards")
    .insert([...playerCards, ...centerCards]);

  if (cardError) {
    console.error("Failed to insert wolf game cards", {
      code: cardError.code,
      details: cardError.details,
      hint: cardError.hint,
      message: cardError.message,
      roles: roleDeckValidation.roles,
    });
    await supabase.from("wolf_game_sessions").delete().eq("id", game.id);
    if (cardError.message.includes("invalid input value for enum")) {
      return {
        ok: false,
        error: "Không thể chia bài vì database chưa có enum role mới. Cần chạy migration wolf_extra_roles.",
      };
    }

    return { ok: false, error: "Không thể chia bài cho ván mới." };
  }

  await supabase
    .from("wolf_rooms")
    .update({ status: "playing", current_game_id: game.id })
    .eq("id", room.id);

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true, roomCode: room.code, gameId: game.id };
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
  const { data: gameData } = await supabase
    .from("wolf_game_sessions")
    .select("id, room_id, phase, round_number, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!gameData) {
    return null;
  }

  const game = gameData as GameRow;
  const { data: cardsData } = await supabase
    .from("wolf_game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", game.id);
  const { data: actionsData } = await supabase
    .from("wolf_game_actions")
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_center_index, target_center_index_2, target_center_index_3")
    .eq("game_id", game.id);
  const { data: votesData } = await supabase
    .from("wolf_game_votes")
    .select("id, game_id, voter_player_id, target_player_id, is_skip")
    .eq("game_id", game.id);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const votes = (votesData ?? []) as VoteRow[];
  const shouldRevealAll = game.phase === "result";
  const { cardMovementSummary } = shouldRevealAll
    ? simulateNightResolution(cards, actions, players)
    : { cardMovementSummary: null };
  const phaseConfirmations = isConfirmablePhase(game.phase)
    ? await getPhaseConfirmations(supabase, game.id, game.phase)
    : [];
  const myCard = currentPlayer ? getPlayerCard(cards, currentPlayer.id) : null;
  const originalWerewolfPlayerIds = getOriginalWerewolfPlayerIds(cards);
  const werewolfTeammates =
    currentPlayer && isWerewolfRole(myCard?.original_role)
      ? originalWerewolfPlayerIds
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
  const playerCardsById = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card])
  );
  const shouldRevealMyCurrentRole = shouldRevealAll;
  const revealedCenterIndexes = new Set<number>();

  if (myAction?.action_type === "seer") {
    if (validateCenterIndex(myAction.target_center_index)) {
      revealedCenterIndexes.add(myAction.target_center_index as number);
    }
    if (validateCenterIndex(myAction.target_center_index_2)) {
      revealedCenterIndexes.add(myAction.target_center_index_2 as number);
    }
    if (validateCenterIndex(myAction.target_center_index_3)) {
      revealedCenterIndexes.add(myAction.target_center_index_3 as number);
    }
  }

  if (
    myAction?.action_type === "copycat" &&
    validateCenterIndex(myAction.target_center_index)
  ) {
    revealedCenterIndexes.add(myAction.target_center_index as number);

    if (validateCenterIndex(myAction.target_center_index_2)) {
      revealedCenterIndexes.add(myAction.target_center_index_2 as number);
    }
    if (validateCenterIndex(myAction.target_center_index_3)) {
      revealedCenterIndexes.add(myAction.target_center_index_3 as number);
    }
  }

  if (myAction?.action_type === "witch" && validateCenterIndex(myAction.target_center_index)) {
    revealedCenterIndexes.add(myAction.target_center_index as number);
  }

  if (
    myAction?.action_type === "werewolf" &&
    originalWerewolfPlayerIds.length === 1 &&
    validateCenterIndex(myAction.target_center_index)
  ) {
    revealedCenterIndexes.add(myAction.target_center_index as number);
  }

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
      ...mapLobbyPlayer(player),
      role: shouldRevealAll ? playerCardsById.get(player.id)?.current_role ?? null : null,
      voteTargetPlayerId: shouldRevealAll ? voteByVoterId.get(player.id) ?? null : null,
      hasSkippedVote: shouldRevealAll ? skippedVotePlayerIds.has(player.id) : false,
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
        }
      : null,
    werewolfTeammates,
    centerCards: [0, 1, 2].map((index) => {
      const centerCard = getCenterCard(cards, index);
      return {
        index,
        role: shouldRevealAll || revealedCenterIndexes.has(index) ? centerCard?.original_role ?? null : null,
      };
    }),
    myAction: myAction
      ? {
          actionType: myAction.action_type,
          targetPlayerId: myAction.target_player_id,
          targetPlayerId2: myAction.target_player_id_2,
          targetCenterIndex: myAction.target_center_index,
          targetCenterIndex2: myAction.target_center_index_2,
          targetCenterIndex3: myAction.target_center_index_3,
        }
      : null,
    myVoteTargetPlayerId: myVote?.target_player_id ?? null,
    isCurrentPlayerPhaseReady: currentPlayer ? phaseReadyPlayerIdSet.has(currentPlayer.id) : false,
    phaseReadyPlayerIds,
    nightReviewMessages: buildNightReviewMessages(currentPlayer, myAction, cards, players, actions),
    allNightActionsSubmitted: players.every((player) => actionPlayerIds.has(player.id)),
    allVotesSubmitted: players.every((player) => voteByVoterId.has(player.id)),
    allPhaseConfirmationsSubmitted:
      isConfirmablePhase(game.phase) && players.every((player) => phaseReadyPlayerIdSet.has(player.id)),
    result: shouldRevealAll ? buildGameResult(players, cards, votes) : null,
    cardMovementSummary,
    allPlayersSummary: shouldRevealAll
      ? players.filter((player) => playerCardsById.has(player.id)).map((player) => {
          const playerCard = playerCardsById.get(player.id);
          return {
            playerId: player.id,
            playerName: player.name,
            originalRole: playerCard?.original_role as WolfRole,
            finalRole: playerCard?.current_role as WolfRole,
          };
        })
      : null,
    roleDeck: ROLE_RESOLUTION_ORDER.flatMap((role) =>
      cards.filter((card) => card.original_role === role).map(() => role)
    ),
  };
}

export async function revealWolfCenterCard(
  roomCode: string,
  centerIndex: number
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
    .from("wolf_game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const cards = (cardsData ?? []) as CardRow[];
  const myCard = getPlayerCard(cards, currentPlayer.id);
  const myRole = myCard?.original_role;
  const werewolfCount = cards.filter((card) => card.player_id && isWerewolfRole(card.original_role)).length;
  const canRevealCenter =
    myRole === "seer" ||
    myRole === "witch" ||
    myRole === "copycat" ||
    (myRole === "werewolf" && werewolfCount === 1);

  if (!canRevealCenter) {
    return { ok: false, error: "Vai trò của bạn không được xem lá giữa bàn lúc này." };
  }

  const centerCard = getCenterCard(cards, centerIndex);

  if (!centerCard) {
    return { ok: false, error: "Không tìm thấy lá giữa đã chọn." };
  }

  return {
    ok: true,
    centerIndex,
    role: centerCard.original_role,
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
    .from("wolf_game_cards")
    .select("original_role")
    .eq("game_id", room.current_game_id)
    .eq("player_id", currentPlayer.id)
    .maybeSingle();
  const originalRole = myCard?.original_role as WolfRole | undefined;
  const { data: gameCardsData } = await supabase
    .from("wolf_game_cards")
    .select("id, game_id, player_id, center_index, original_role, current_role")
    .eq("game_id", room.current_game_id);
  const gameCards = (gameCardsData ?? []) as CardRow[];

  if (!originalRole || input.actionType !== originalRole) {
    return { ok: false, error: "Hành động không khớp với vai trò của bạn." };
  }

  const targetPlayerIds = [input.targetPlayerId, input.targetPlayerId2].filter(Boolean) as string[];
  const activePlayerIds = new Set(players.map((player) => player.id));
  const otherPlayerIds = new Set(
    players.filter((player) => player.id !== currentPlayer.id).map((player) => player.id)
  );

  if (targetPlayerIds.some((playerId) => !activePlayerIds.has(playerId))) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
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
    const werewolfCount = gameCards.filter((card) => card.player_id && isWerewolfRole(card.original_role)).length;

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

  if (originalRole === "seer") {
    const isViewingPlayer = Boolean(input.targetPlayerId);
    const isViewingCenter = input.targetCenterIndex != null || input.targetCenterIndex2 != null;

    if (isViewingPlayer && isViewingCenter) {
      return { ok: false, error: "Tiên Tri chỉ được chọn xem một người chơi hoặc hai lá giữa bàn." };
    }

    if (
      !isViewingPlayer &&
      (!validateCenterIndex(input.targetCenterIndex) ||
        !validateCenterIndex(input.targetCenterIndex2) ||
        input.targetCenterIndex === input.targetCenterIndex2)
    ) {
      return { ok: false, error: "Tiên Tri phải chọn một người chơi hoặc hai lá giữa bàn." };
    }
  }

  if (originalRole === "werewolf_seer" && (!input.targetPlayerId || !activePlayerIds.has(input.targetPlayerId))) {
    return { ok: false, error: "Sói Tiên Tri phải chọn một người chơi để soi." };
  }

  if (
    originalRole === "witch" &&
    (!validateCenterIndex(input.targetCenterIndex) ||
      !input.targetPlayerId ||
      !activePlayerIds.has(input.targetPlayerId))
  ) {
    return { ok: false, error: "Phù Thuỷ phải chọn một lá giữa bàn và một người nhận." };
  }

  if (originalRole === "copycat") {
    if (!validateCenterIndex(input.targetCenterIndex)) {
      return { ok: false, error: "Copy Cat phải chọn một lá giữa bàn để copy." };
    }

    const copiedCard = getCenterCard(gameCards, input.targetCenterIndex as number);
    const copiedRole = copiedCard?.original_role;

    if (!copiedRole) {
      return { ok: false, error: "Lá giữa Copy Cat chọn không hợp lệ." };
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
      const isViewingPlayer = Boolean(input.targetPlayerId);
      const isViewingCenter = input.targetCenterIndex2 != null || input.targetCenterIndex3 != null;

      if (isViewingPlayer && isViewingCenter) {
        return { ok: false, error: "Copy Cat copy Tiên Tri chỉ được chọn xem người chơi hoặc hai lá giữa bàn." };
      }

      if (
        !isViewingPlayer &&
        (!validateCenterIndex(input.targetCenterIndex2) ||
          !validateCenterIndex(input.targetCenterIndex3) ||
          input.targetCenterIndex2 === input.targetCenterIndex3 ||
          input.targetCenterIndex === input.targetCenterIndex2 ||
          input.targetCenterIndex === input.targetCenterIndex3)
      ) {
        return { ok: false, error: "Copy Cat copy Tiên Tri phải chọn hai lá giữa khác lá đã copy." };
      }
    }

    if (copiedRole === "werewolf_seer" && (!input.targetPlayerId || !activePlayerIds.has(input.targetPlayerId))) {
      return { ok: false, error: "Copy Cat copy Sói Tiên Tri phải chọn một người chơi để soi." };
    }
  }

  const { error } = await supabase
    .from("wolf_game_actions")
    .upsert(
      {
        game_id: room.current_game_id,
        player_id: currentPlayer.id,
        action_type: originalRole,
        target_player_id: input.targetPlayerId ?? null,
        target_player_id_2: input.targetPlayerId2 ?? null,
        target_center_index: input.targetCenterIndex ?? null,
        target_center_index_2: input.targetCenterIndex2 ?? null,
        target_center_index_3: input.targetCenterIndex3 ?? null,
      },
      { onConflict: "game_id,player_id" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu hành động ban đêm." };
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
    .from("wolf_game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game || !isConfirmablePhase(game.phase)) {
    return { ok: false, error: "Giai đoạn này không cần xác nhận." };
  }

  const { error } = await supabase
    .from("wolf_game_phase_confirmations")
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

export async function advanceWolfDiscussionIfExpired(roomCode: string): Promise<WolfMutationResult> {
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
    .from("wolf_game_sessions")
    .select("id, phase, discussion_ends_at")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (game.phase !== "discussion") {
    return { ok: true };
  }

  if (!game.discussion_ends_at || new Date(game.discussion_ends_at).getTime() > Date.now()) {
    return { ok: true };
  }

  await maybeAutoAdvancePhase(supabase, room, players, "discussion");
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
    .from("wolf_game_sessions")
    .select("id, phase")
    .eq("id", room.current_game_id)
    .maybeSingle();

  if (!game) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  if (game.phase === "card_reveal") {
    await supabase.from("wolf_game_sessions").update({ phase: "night" }).eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "night") {
    await resolveNightActions(game.id);
    await supabase
      .from("wolf_game_sessions")
      .update({ phase: "night_review" })
      .eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "night_review") {
    await supabase
      .from("wolf_game_sessions")
      .update({
        phase: "discussion",
        discussion_ends_at: new Date(Date.now() + DISCUSSION_DURATION_MS).toISOString(),
      })
      .eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "discussion") {
    await supabase.from("wolf_game_sessions").update({ phase: "voting" }).eq("id", game.id);
    await safeBroadcastWolfPlayUpdate(room.code);
    return { ok: true };
  }

  if (game.phase === "voting") {
    await supabase.from("wolf_game_sessions").update({ phase: "result" }).eq("id", game.id);
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
    .from("wolf_game_sessions")
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
    .from("wolf_game_votes")
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
    .from("wolf_rooms")
    .update({ status: "waiting", current_game_id: null })
    .eq("id", room.id);
  await supabase
    .from("wolf_room_players")
    .update({ is_ready: false })
    .eq("room_id", room.id)
    .eq("is_host", false);

  await safeBroadcastWolfRoomUpdate(room.code);
  await safeBroadcastWolfPlayUpdate(room.code);

  return { ok: true };
}
