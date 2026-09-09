import type { WolfGamePhase, WolfRole } from "@/lib/supabase/types";
import type { WolfPlayState } from "../games/wolf/actions";
import { getDebugWolfResultCase } from "./wolf-result-cases";

// Case dùng chung cho cả phase night (xem UI lượt sói đơn) lẫn phase result (xem log).
export const LONE_WEREWOLF_SEER_CASE_KEY = "werewolf-seer-lone";

// Phase night nhưng KHÔNG phải lượt của mình — activeNightTurn trỏ tới người chơi khác (p2) thay
// vì currentPlayerId (p1) nên isMyNightTurn = false, xem đúng UI "đang chờ người chơi khác".
export const NIGHT_WAITING_OTHER_CASE_KEY = "night-waiting-other";

// 2 case demo phần "Xem lại hành động ban đêm" (nightReminder) cho role có NHIỀU hành động trong
// đêm (copy được role ở giữa/nhân bản người khác rồi thực hiện chức năng đã copy) — dùng để xem
// UI sau khi sửa bug chỉ hiện hành động đầu tiên, thiếu hành động thứ 2 (xem buildNightReviewMessages,
// src/app/games/wolf/actions.ts).
export const REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY = "reminder-copycat-troublemaker";
export const REMINDER_DOPPELGANGER_WITCH_CASE_KEY = "reminder-doppelganger-witch";

// Phase night_review cho Kẻ Trộm (Robber) — mình chính là Kẻ Trộm, đã đổi bài với Yun (Ma Sói) nên
// "lá vừa lấy" (nightReviewRole) là Ma Sói, khác hẳn case mặc định (Tiên Tri, không có lá vừa lấy).
export const REVIEW_ROBBER_CASE_KEY = "review-robber";

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

    // Không phải lượt của mình: server THẬT chỉ trả activeNightTurn khác null khi
    // activeNightTurn.playerId === currentPlayerId (xem actions.ts dòng ~4539-4542) — server
    // KHÔNG BAO GIỜ gửi thông tin lượt của người khác cho mình, nên state "đang chờ người khác"
    // đúng thực tế là activeNightTurn: null (không phải object với playerId khác p1) kèm
    // isNightTurnInProgress: true (biết có ai đó đang trong lượt, nhưng không biết là ai).
    if (resultCaseKey === NIGHT_WAITING_OTHER_CASE_KEY) {
      return {
        ...state,
        activeNightTurn: null,
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
    // Kẻ Trộm (Robber): đổi bài với Yun (Ma Sói) — nightReviewRole = "werewolf" (lá vừa lấy),
    // khác case mặc định (Tiên Tri, không có lá vừa lấy, chỉ có lá giữa đã soi).
    if (resultCaseKey === REVIEW_ROBBER_CASE_KEY) {
      return {
        ...state,
        players: buildPlayers({
          revealRoles: true,
          roleByPlayerId: { p1: "robber", p2: "werewolf", p3: "villager", p4: "troublemaker", p5: "seer" },
          phaseReadyPlayerIds: ["p4"],
        }),
        myCard: {
          originalRole: "robber",
          currentRole: "werewolf",
          nightReviewRole: "werewolf",
        },
        phaseReadyPlayerIds: ["p4"],
        nightReviewMessages: ["Bạn đã đổi bài với Yun. Bài bạn nhận được lúc đổi là Ma Sói."],
        nightReminder: {
          title: "Lượt Kẻ Trộm",
          lines: ["Bạn đã đổi bài với Yun. Bài bạn nhận được lúc đổi là Ma Sói."],
        },
      };
    }

    return {
      ...state,
      // nightReviewRole: null — Tiên Tri KHÔNG có "lá vừa lấy" (khác Kẻ Trộm/Mất Ngủ/Copy Cat...
      // thật sự đổi/nhận bài mới, xem getNightReviewRole() trong actions.ts: chỉ trả về role khi
      // action_type là robber/insomniac hoặc copycat/doppelganger copy trúng 2 role đó). Data debug
      // cũ để "seer" ở đây khiến renderKnownNightCards() hiện thừa 1 thẻ "Tiên Tri" cạnh lá giữa đã
      // soi — sai với thật (Tiên Tri chỉ xem được đúng những lá giữa đã chọn, không có thẻ bài mới).
      myCard: {
        originalRole: "seer",
        currentRole: "seer",
        nightReviewRole: null,
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
    // Demo nút "Xem lại hành động ban đêm" (nightReminder, chỉ hiện ở phase discussion — xem
    // renderNightReminderButton() trong wolf-play-screen.tsx) cho Copy Cat copy Kẻ Gây Rối
    // (Troublemaker): role có 2 bước, copy lá giữa xong thực hiện luôn chức năng Kẻ Gây Rối.
    // Trước khi sửa bug, dòng thứ 2 (kết quả đổi bài) bị thiếu, modal chỉ còn dòng
    // "Bạn đã copy lá giữa X: Kẻ Gây Rối." trơ trọi.
    if (resultCaseKey === REMINDER_COPYCAT_TROUBLEMAKER_CASE_KEY) {
      return {
        ...state,
        myCard: {
          originalRole: "copycat",
          currentRole: "copycat",
          nightReviewRole: "copycat",
        },
        players: buildPlayers({ phaseReadyPlayerIds: ["p3", "p5"] }),
        phaseReadyPlayerIds: ["p3", "p5"],
        nightReminder: {
          title: "Copy Cat trong đêm",
          lines: [
            "Bạn đã copy lá giữa 1: Kẻ Gây Rối. Bạn đã đổi bài của Trí và Lan Nè. Bạn không được xem hai lá đó.",
          ],
        },
      };
    }

    // Demo Nhân Bản (Doppelganger) copy Phù Thuỷ (Witch) — cũng 2 bước: nhân bản người chơi xong
    // thực hiện luôn chức năng Phù Thuỷ (mở 1 lá giữa, đổi với 1 người chơi).
    if (resultCaseKey === REMINDER_DOPPELGANGER_WITCH_CASE_KEY) {
      return {
        ...state,
        myCard: {
          originalRole: "doppelganger",
          currentRole: "doppelganger",
          nightReviewRole: "doppelganger",
        },
        players: buildPlayers({ phaseReadyPlayerIds: ["p3", "p5"] }),
        phaseReadyPlayerIds: ["p3", "p5"],
        nightReminder: {
          title: "Nhân Bản trong đêm",
          lines: ["Bạn đã nhân bản Lan Nè (Phù Thuỷ) và mở lá giữa 2 rồi đổi lá đó với Trí."],
        },
      };
    }

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
