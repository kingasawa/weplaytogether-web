"use server";

import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { WolfGamePhase, WolfRole, WolfRoomStatus } from "@/lib/supabase/types";
import { WOLF_ROLE_LABELS } from "@/lib/wolf-game";

const ROOM_CODE_PATTERN = /^[a-z]{4}$/;
const PLAYER_SESSION_COOKIE = "boardverse_wolf_session";
const MAX_PLAYERS = 10;
const DISCUSSION_DURATION_MS = 5 * 60 * 1000;

const ROLE_DECK_ORDER: WolfRole[] = [
  "werewolf",
  "villager",
  "seer",
  "robber",
  "troublemaker",
  "drunk",
  "insomniac",
  "werewolf",
  "villager",
  "villager",
  "villager",
  "villager",
  "villager",
];

const ROLE_RESOLUTION_ORDER: WolfRole[] = [
  "seer",
  "robber",
  "troublemaker",
  "drunk",
  "insomniac",
  "werewolf",
  "villager",
];

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
};

type VoteRow = {
  id: string;
  game_id: string;
  voter_player_id: string;
  target_player_id: string;
};

type PhaseConfirmationRow = {
  id: string;
  game_id: string;
  player_id: string;
  phase: WolfGamePhase;
};

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
    currentGameId: string | null;
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

export type WolfCenterCardState = {
  index: number;
  role: WolfRole | null;
};

export type WolfPlayPlayer = WolfLobbyPlayer & {
  role: WolfRole | null;
  voteTargetPlayerId: string | null;
  hasVoted: boolean;
  hasNightAction: boolean;
  isPhaseReady: boolean;
};

export type WolfGameResult = {
  eliminatedPlayerIds: string[];
  winnerTeam: "villagers" | "werewolves";
  winnerText: string;
  voteCounts: Array<{
    playerId: string;
    votes: number;
  }>;
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
  centerCards: WolfCenterCardState[];
  myAction: {
    actionType: string;
    targetPlayerId: string | null;
    targetPlayerId2: string | null;
    targetCenterIndex: number | null;
    targetCenterIndex2: number | null;
  } | null;
  myVoteTargetPlayerId: string | null;
  isCurrentPlayerPhaseReady: boolean;
  phaseReadyPlayerIds: string[];
  nightReviewMessages: string[];
  allNightActionsSubmitted: boolean;
  allVotesSubmitted: boolean;
  allPhaseConfirmationsSubmitted: boolean;
  result: WolfGameResult | null;
};

export type WolfNightActionInput = {
  actionType: string;
  targetPlayerId?: string | null;
  targetPlayerId2?: string | null;
  targetCenterIndex?: number | null;
  targetCenterIndex2?: number | null;
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
  const { data: players } = await supabase
    .from("wolf_room_players")
    .select("id, room_id, session_id, name, is_host, is_ready, joined_at")
    .eq("room_id", room.id)
    .order("joined_at", { ascending: true });

  return (players ?? []) as PlayerRow[];
}

function mapLobbyPlayer(player: PlayerRow): WolfLobbyPlayer {
  return {
    id: player.id,
    name: player.name,
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

function getCenterCard(cards: CardRow[], centerIndex: number) {
  return cards.find((card) => card.center_index === centerIndex) ?? null;
}

function validateCenterIndex(centerIndex?: number | null) {
  return typeof centerIndex === "number" && centerIndex >= 0 && centerIndex <= 2;
}

function buildNightReviewMessages(
  currentPlayer: PlayerRow | null,
  action: ActionRow | null,
  cards: CardRow[],
  players: PlayerRow[]
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

  if (action.action_type === "werewolf") {
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
    const myCard = getPlayerCard(cards, currentPlayer.id);

    return [
      `Bạn đã đổi bài với ${getPlayerName(players, action.target_player_id)}. Bài hiện tại của bạn là ${getRoleReviewLabel(
        myCard?.current_role
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

    if (confirmations.length >= players.length) {
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
    if (activePlayerIds.has(vote.target_player_id)) {
      voteMap.set(vote.target_player_id, (voteMap.get(vote.target_player_id) ?? 0) + 1);
    }
  }

  const voteCounts = Array.from(voteMap.entries()).map(([playerId, voteCount]) => ({
    playerId,
    votes: voteCount,
  }));
  const maxVotes = Math.max(0, ...voteCounts.map((voteCount) => voteCount.votes));
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
    .filter((player) => finalRoleByPlayerId.get(player.id) === "werewolf")
    .map((player) => player.id);
  const eliminatedWerewolf = eliminatedPlayerIds.some(
    (playerId) => finalRoleByPlayerId.get(playerId) === "werewolf"
  );

  if (werewolfPlayerIds.length === 0) {
    const villagersWin = eliminatedPlayerIds.length === 0;
    return {
      eliminatedPlayerIds,
      winnerTeam: villagersWin ? "villagers" : "werewolves",
      winnerText: villagersWin
        ? "Không có Ma Sói và không ai bị treo. Dân làng thắng."
        : "Không có Ma Sói nhưng có người bị treo. Dân làng thua.",
      voteCounts,
    };
  }

  return {
    eliminatedPlayerIds,
    winnerTeam: eliminatedWerewolf ? "villagers" : "werewolves",
    winnerText: eliminatedWerewolf
      ? "Có Ma Sói bị treo. Dân làng thắng."
      : "Không có Ma Sói nào bị treo. Ma Sói thắng.",
    voteCounts,
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
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_center_index, target_center_index_2")
    .eq("game_id", gameId);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const actionByPlayerId = new Map(actions.map((action) => [action.player_id, action]));
  const currentRoleByCardId = new Map(cards.map((card) => [card.id, card.original_role]));
  const roleOfCard = (card: CardRow) => currentRoleByCardId.get(card.id) ?? card.original_role;
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

      if (role === "robber" && action.target_player_id) {
        swapCards(card, getPlayerCard(cards, action.target_player_id));
      }

      if (role === "troublemaker" && action.target_player_id && action.target_player_id_2) {
        swapCards(getPlayerCard(cards, action.target_player_id), getPlayerCard(cards, action.target_player_id_2));
      }

      if (role === "drunk" && validateCenterIndex(action.target_center_index)) {
        swapCards(card, getCenterCard(cards, action.target_center_index as number));
      }
    }
  }

  await Promise.all(
    cards.map((card) =>
      supabase
        .from("wolf_game_cards")
        .update({ current_role: currentRoleByCardId.get(card.id) ?? card.original_role })
        .eq("id", card.id)
    )
  );
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
    .maybeSingle();

  if (existingPlayer) {
    await supabase
      .from("wolf_room_players")
      .update({ name })
      .eq("id", existingPlayer.id);

    return { ok: true, roomCode: room.code, playerId: existingPlayer.id };
  }

  const { count: activePlayerCount } = await supabase
    .from("wolf_room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

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
    .select("id, code, status, host_player_id, current_game_id")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    return;
  }

  if (room.status !== "waiting") {
    return;
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
      .update({ host_player_id: null, status: "finished" })
      .eq("id", room.id);
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

export async function startWolfGame(roomCode: string): Promise<WolfStartGameResult> {
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

  const roles = shuffleRoles(ROLE_DECK_ORDER.slice(0, players.length + 3));
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
    await supabase.from("wolf_game_sessions").delete().eq("id", game.id);
    return { ok: false, error: "Không thể chia bài cho ván mới." };
  }

  await supabase
    .from("wolf_rooms")
    .update({ status: "playing", current_game_id: game.id })
    .eq("id", room.id);

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
    .select("id, game_id, player_id, action_type, target_player_id, target_player_id_2, target_center_index, target_center_index_2")
    .eq("game_id", game.id);
  const { data: votesData } = await supabase
    .from("wolf_game_votes")
    .select("id, game_id, voter_player_id, target_player_id")
    .eq("game_id", game.id);

  const cards = (cardsData ?? []) as CardRow[];
  const actions = (actionsData ?? []) as ActionRow[];
  const votes = (votesData ?? []) as VoteRow[];
  const phaseConfirmations = isConfirmablePhase(game.phase)
    ? await getPhaseConfirmations(supabase, game.id, game.phase)
    : [];
  const myCard = currentPlayer ? getPlayerCard(cards, currentPlayer.id) : null;
  const myAction = currentPlayer
    ? actions.find((action) => action.player_id === currentPlayer.id) ?? null
    : null;
  const myVote = currentPlayer
    ? votes.find((vote) => vote.voter_player_id === currentPlayer.id) ?? null
    : null;
  const actionPlayerIds = new Set(actions.map((action) => action.player_id));
  const voteByVoterId = new Map(votes.map((vote) => [vote.voter_player_id, vote.target_player_id]));
  const votePlayerIds = new Set(votes.map((vote) => vote.voter_player_id));
  const phaseReadyPlayerIds = phaseConfirmations.map((confirmation) => confirmation.player_id);
  const phaseReadyPlayerIdSet = new Set(phaseReadyPlayerIds);
  const playerCardsById = new Map(
    cards
      .filter((card) => card.player_id)
      .map((card) => [card.player_id as string, card])
  );
  const shouldRevealAll = game.phase === "result";
  const shouldRevealMyCurrentRole = shouldRevealAll;
  const revealedCenterIndexes = new Set<number>();

  if (myAction?.action_type === "seer") {
    if (validateCenterIndex(myAction.target_center_index)) {
      revealedCenterIndexes.add(myAction.target_center_index as number);
    }
    if (validateCenterIndex(myAction.target_center_index_2)) {
      revealedCenterIndexes.add(myAction.target_center_index_2 as number);
    }
  }

  if (myAction?.action_type === "werewolf" && validateCenterIndex(myAction.target_center_index)) {
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
    centerCards: [0, 1, 2].map((index) => {
      const centerCard = getCenterCard(cards, index);
      return {
        index,
        role: shouldRevealAll || revealedCenterIndexes.has(index) ? centerCard?.current_role ?? null : null,
      };
    }),
    myAction: myAction
      ? {
          actionType: myAction.action_type,
          targetPlayerId: myAction.target_player_id,
          targetPlayerId2: myAction.target_player_id_2,
          targetCenterIndex: myAction.target_center_index,
          targetCenterIndex2: myAction.target_center_index_2,
        }
      : null,
    myVoteTargetPlayerId: myVote?.target_player_id ?? null,
    isCurrentPlayerPhaseReady: currentPlayer ? phaseReadyPlayerIdSet.has(currentPlayer.id) : false,
    phaseReadyPlayerIds,
    nightReviewMessages: buildNightReviewMessages(currentPlayer, myAction, cards, players),
    allNightActionsSubmitted: players.every((player) => actionPlayerIds.has(player.id)),
    allVotesSubmitted: players.every((player) => voteByVoterId.has(player.id)),
    allPhaseConfirmationsSubmitted:
      isConfirmablePhase(game.phase) && players.every((player) => phaseReadyPlayerIdSet.has(player.id)),
    result: shouldRevealAll ? buildGameResult(players, cards, votes) : null,
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

  if (
    originalRole === "seer" &&
    !input.targetPlayerId &&
    (!validateCenterIndex(input.targetCenterIndex) ||
      !validateCenterIndex(input.targetCenterIndex2) ||
      input.targetCenterIndex === input.targetCenterIndex2)
  ) {
    return { ok: false, error: "Tiên Tri phải chọn một người chơi hoặc hai lá giữa bàn." };
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
      },
      { onConflict: "game_id,player_id" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu hành động ban đêm." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, "night");

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
    return { ok: true };
  }

  if (game.phase === "night") {
    await resolveNightActions(game.id);
    await supabase
      .from("wolf_game_sessions")
      .update({ phase: "night_review" })
      .eq("id", game.id);
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
    return { ok: true };
  }

  if (game.phase === "discussion") {
    await supabase.from("wolf_game_sessions").update({ phase: "voting" }).eq("id", game.id);
    return { ok: true };
  }

  if (game.phase === "voting") {
    await supabase.from("wolf_game_sessions").update({ phase: "result" }).eq("id", game.id);
    return { ok: true };
  }

  return { ok: false, error: "Ván đã kết thúc." };
}

export async function submitWolfVote(
  roomCode: string,
  targetPlayerId: string
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

  if (!players.some((player) => player.id === targetPlayerId)) {
    return { ok: false, error: "Người chơi được chọn không hợp lệ." };
  }

  const { error } = await supabase
    .from("wolf_game_votes")
    .upsert(
      {
        game_id: game.id,
        voter_player_id: currentPlayer.id,
        target_player_id: targetPlayerId,
      },
      { onConflict: "game_id,voter_player_id" }
    );

  if (error) {
    return { ok: false, error: "Không thể lưu phiếu bầu." };
  }

  await maybeAutoAdvancePhase(supabase, room, players, "voting");

  return { ok: true };
}

export async function finishWolfGame(roomCode: string): Promise<WolfMutationResult> {
  const sessionId = await getPlayerSessionId();
  const { supabase, room } = await getRoomByCode(roomCode);

  if (!sessionId || !room?.current_game_id) {
    return { ok: false, error: "Không tìm thấy ván đang chơi." };
  }

  const players = await getActivePlayers(supabase, room);
  const currentPlayer = getCurrentPlayer(players, sessionId);

  if (!isHost(currentPlayer, room)) {
    return { ok: false, error: "Chỉ chủ phòng mới được kết thúc ván." };
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

  return { ok: true };
}
