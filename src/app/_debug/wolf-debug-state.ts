import type { WolfGamePhase, WolfRole } from "@/lib/supabase/types";
import type { WolfPlayState } from "../games/wolf/actions";
import { getDebugWolfResultCase } from "./wolf-result-cases";

// Case dùng chung cho cả phase night (xem UI lượt sói đơn) lẫn phase result (xem log).
export const LONE_WEREWOLF_SEER_CASE_KEY = "werewolf-seer-lone";

export const DEBUG_WOLF_PHASES: WolfGamePhase[] = [
  "card_reveal",
  "night",
  "night_review",
  "discussion",
  "voting",
  "result",
];

const DEBUG_ROOM: WolfPlayState["room"] = {
  id: "debug-room",
  code: "DEBUG1",
  status: "playing",
  hostPlayerId: "p1",
  currentGameId: "debug-game",
};

const DEBUG_PLAYER_SEEDS = [
  { id: "p1", name: "Khánh", avatarKey: "img_1", isHost: true },
  { id: "p2", name: "Yun", avatarKey: "img_2", isHost: false },
  { id: "p3", name: "Trí", avatarKey: "img_3", isHost: false },
  { id: "p4", name: "Lan Nè", avatarKey: "img_4", isHost: false },
  { id: "p5", name: "Đại Chúa", avatarKey: "img_5", isHost: false },
];

// Bộ bài mock: 5 người chơi + 3 lá giữa bàn.
// Giữ đúng thứ tự lượt đêm như server trả về (buildRoleDeck sắp theo ROLE_RESOLUTION_ORDER).
const DEBUG_ROLE_DECK: WolfRole[] = [
  "doppelganger",
  "werewolf",
  "werewolf",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
  "villager",
];

const DEBUG_ROLE_BY_PLAYER_ID: Record<string, WolfRole> = {
  p1: "seer",
  p2: "doppelganger",
  p3: "werewolf",
  p4: "villager",
  p5: "robber",
};

function buildPlayers(overrides: {
  phaseReadyPlayerIds?: string[];
  votedPlayerIds?: string[];
  voteTargetByPlayerId?: Record<string, string | null>;
  revealRoles?: boolean;
  roleByPlayerId?: Record<string, WolfRole>;
}): WolfPlayState["players"] {
  const phaseReadyPlayerIds = overrides.phaseReadyPlayerIds ?? [];
  const votedPlayerIds = overrides.votedPlayerIds ?? [];
  const voteTargetByPlayerId = overrides.voteTargetByPlayerId ?? {};

  return DEBUG_PLAYER_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    avatarKey: seed.avatarKey,
    avatarObjectKey: null,
    avatarUrl: null,
    avatarFrameUrl: null,
    profileFrameUrl: null,
    profileFrameColor: null,
    hasEquippedProfileFrame: false,
    isHost: seed.isHost,
    isReady: true,
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: overrides.revealRoles
      ? overrides.roleByPlayerId?.[seed.id] ?? DEBUG_ROLE_BY_PLAYER_ID[seed.id]
      : null,
    voteTargetPlayerId: voteTargetByPlayerId[seed.id] ?? null,
    hasSkippedVote: votedPlayerIds.includes(seed.id) && !voteTargetByPlayerId[seed.id],
    hasVoted: votedPlayerIds.includes(seed.id),
    hasNightAction: true,
    isPhaseReady: phaseReadyPlayerIds.includes(seed.id),
  }));
}

function buildBaseState(phase: WolfGamePhase): WolfPlayState {
  return {
    room: DEBUG_ROOM,
    game: {
      id: "debug-game",
      phase,
      roundNumber: 1,
      discussionEndsAt: null,
    },
    players: buildPlayers({}),
    currentPlayerId: "p1",
    isCurrentPlayerHost: true,
    myCard: {
      originalRole: "seer",
      currentRole: null,
      nightReviewRole: null,
    },
    werewolfTeammates: [],
    centerCards: [
      { index: 0, role: null, isWerewolf: null },
      { index: 1, role: null, isWerewolf: null },
      { index: 2, role: null, isWerewolf: null },
    ],
    playerReveals: [],
    myAction: null,
    myVoteTargetPlayerId: null,
    activeNightTurn: null,
    isCurrentNightTurnActionSubmitted: false,
    isNightTurnInProgress: false,
    isCurrentPlayerPhaseReady: false,
    phaseReadyPlayerIds: [],
    nightReviewMessages: [],
    nightReminder: null,
    allNightActionsSubmitted: false,
    allVotesSubmitted: false,
    allPhaseConfirmationsSubmitted: false,
    result: null,
    cardMovementSummary: null,
    allPlayersSummary: null,
    roleDeck: DEBUG_ROLE_DECK,
    myScoreReward: null,
  };
}

export function buildDebugWolfState(phase: WolfGamePhase, resultCaseKey?: string): WolfPlayState {
  const state = buildBaseState(phase);

  if (phase === "card_reveal") {
    return {
      ...state,
      players: buildPlayers({ phaseReadyPlayerIds: ["p2", "p3"] }),
      phaseReadyPlayerIds: ["p2", "p3"],
    };
  }

  if (phase === "night") {
    // Lượt Sói Tiên Tri là sói đơn: vừa chọn người để soi, vừa được xem một lá giữa bàn.
    if (resultCaseKey === LONE_WEREWOLF_SEER_CASE_KEY) {
      return {
        ...state,
        // Preview cần biết role của người chơi để mô phỏng bước soi bài.
        // Bộ vai riêng cho kịch bản này: mình là Ma Sói DUY NHẤT trên bàn.
        players: buildPlayers({
          revealRoles: true,
          roleByPlayerId: { p1: "werewolf_seer", p2: "seer", p3: "villager", p4: "troublemaker", p5: "robber" },
        }),
        myCard: { originalRole: "werewolf_seer", currentRole: null, nightReviewRole: null },
        werewolfTeammates: [],
        activeNightTurn: {
          playerId: "p1",
          playerName: "Khánh",
          originalRole: "werewolf_seer",
          activeRole: "werewolf_seer",
          copiedRole: null,
          isCopycatCopiedRole: false,
        },
        isNightTurnInProgress: true,
      };
    }

    return {
      ...state,
      activeNightTurn: {
        playerId: "p1",
        playerName: "Khánh",
        originalRole: "seer",
        activeRole: "seer",
        copiedRole: null,
        isCopycatCopiedRole: false,
      },
      isNightTurnInProgress: true,
    };
  }

  if (phase === "night_review") {
    return {
      ...state,
      myCard: {
        originalRole: "seer",
        currentRole: "seer",
        nightReviewRole: "seer",
      },
      centerCards: [
        { index: 0, role: "werewolf", isWerewolf: true },
        { index: 1, role: null, isWerewolf: null },
        { index: 2, role: null, isWerewolf: null },
      ],
      nightReviewMessages: [
        "Bạn đã soi Lá giữa 1: Là Ma Sói.",
        "Vì lá đầu tiên là Ma Sói, lượt của bạn dừng lại tại đây.",
      ],
      players: buildPlayers({ phaseReadyPlayerIds: ["p4"] }),
      phaseReadyPlayerIds: ["p4"],
      nightReminder: {
        title: "Lượt Tiên Tri",
        lines: ["Bạn đã soi Lá giữa 1: Là Ma Sói."],
      },
    };
  }

  if (phase === "discussion") {
    return {
      ...state,
      myCard: {
        originalRole: "seer",
        currentRole: "seer",
        nightReviewRole: "seer",
      },
      players: buildPlayers({ phaseReadyPlayerIds: ["p3", "p5"] }),
      phaseReadyPlayerIds: ["p3", "p5"],
      nightReminder: {
        title: "Lượt Tiên Tri",
        lines: ["Bạn đã soi Lá giữa 1: Là Ma Sói."],
      },
    };
  }

  if (phase === "voting") {
    return {
      ...state,
      players: buildPlayers({
        votedPlayerIds: ["p2", "p3", "p4"],
        voteTargetByPlayerId: { p2: "p3", p3: "p5", p4: "p3" },
      }),
      myVoteTargetPlayerId: null,
    };
  }

  const resultCase = getDebugWolfResultCase(resultCaseKey);
  const finalRoleByPlayerId = Object.fromEntries(
    resultCase.allPlayersSummary.map((summary) => [summary.playerId, summary.finalRole])
  );

  return {
    ...state,
    players: buildPlayers({
      revealRoles: true,
      roleByPlayerId: finalRoleByPlayerId,
      votedPlayerIds: Object.keys(resultCase.voteTargetByPlayerId),
      voteTargetByPlayerId: resultCase.voteTargetByPlayerId,
    }),
    myCard: {
      originalRole: resultCase.myOriginalRole,
      currentRole: resultCase.myFinalRole,
      nightReviewRole: resultCase.myFinalRole,
    },
    roleDeck: resultCase.roleDeck,
    result: resultCase.result,
    cardMovementSummary: resultCase.cardMovementSummary,
    allPlayersSummary: resultCase.allPlayersSummary,
  };
}

export function normalizeDebugWolfPhase(phase?: string): WolfGamePhase {
  return DEBUG_WOLF_PHASES.includes(phase as WolfGamePhase) ? (phase as WolfGamePhase) : "discussion";
}
