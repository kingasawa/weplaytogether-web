import type { ClassicWolfRole } from "@/lib/classic-wolf-game";
import type { WolfGamePhase } from "@/lib/supabase/types";
import type { ClassicWolfPlayState } from "../games/wolf-classic/actions";

// "day_review" không phải phase thật trong DB: đó là phase night_review kèm pendingDeathEvent
// của ban ngày, tách riêng ở trang debug để xem UI "Kết quả bỏ phiếu".
export const DEBUG_CLASSIC_WOLF_VIEWS = [
  "card_reveal",
  "night",
  "night_review",
  "day_review",
  "discussion",
  "voting",
  "result",
] as const;

export type DebugClassicWolfView = (typeof DEBUG_CLASSIC_WOLF_VIEWS)[number];

const DEBUG_ROOM: ClassicWolfPlayState["room"] = {
  id: "debug-room",
  code: "DEBUG2",
  status: "playing",
  hostPlayerId: "p1",
  currentGameId: "debug-game",
};

const DEBUG_PLAYER_SEEDS: Array<{
  id: string;
  name: string;
  avatarKey: string;
  isHost: boolean;
  role: ClassicWolfRole;
}> = [
  { id: "p1", name: "Khánh", avatarKey: "img_1", isHost: true, role: "werewolf" },
  { id: "p2", name: "Yun", avatarKey: "img_2", isHost: false, role: "werewolf" },
  { id: "p3", name: "Trí", avatarKey: "img_3", isHost: false, role: "seer" },
  { id: "p4", name: "Lan Nè", avatarKey: "img_4", isHost: false, role: "witch" },
  { id: "p5", name: "Đại Chúa", avatarKey: "img_5", isHost: false, role: "guard" },
  { id: "p6", name: "Bảo", avatarKey: "img_6", isHost: false, role: "hunter" },
  { id: "p7", name: "Ngọc", avatarKey: "img_7", isHost: false, role: "villager" },
  { id: "p8", name: "Vy", avatarKey: "img_8", isHost: false, role: "villager" },
];

// Giữ đúng thứ tự lượt đêm như server trả về: Bảo Vệ → Ma Sói → Tiên Tri → Phù Thuỷ → Thợ Săn → Dân Làng.
const DEBUG_ROLE_DECK_ORDER: ClassicWolfRole[] = ["guard", "werewolf", "seer", "witch", "hunter", "villager"];
const DEBUG_ROLE_DECK: ClassicWolfRole[] = DEBUG_ROLE_DECK_ORDER.flatMap((role) =>
  DEBUG_PLAYER_SEEDS.filter((seed) => seed.role === role).map((seed) => seed.role)
);

const DEBUG_NIGHT_HISTORY: ClassicWolfPlayState["nightHistory"] = [
  {
    nightNumber: 1,
    guardSummary: "Đại Chúa bảo vệ Ngọc.",
    wolfSummary: "Ma Sói cắn Ngọc.",
    seerSummary: "Trí soi Khánh: Là Ma Sói.",
    witchSummary: "Lan Nè không dùng thuốc.",
    actionDescriptions: [
      { role: "guard", text: "Bảo Vệ đã bảo vệ Ngọc", icons: ["shield"] },
      { role: "werewolf", text: "Ma Sói đã cắn Ngọc", icons: [] },
      { role: "seer", text: "Tiên Tri đã soi Khánh: Là Ma Sói", icons: [] },
      { role: "witch", text: "Phù Thuỷ không dùng thuốc", icons: [] },
      { role: "result", text: "Không ai chết trong đêm 1", icons: [] },
      { role: "vote", text: "Cả làng treo cổ Vy", icons: [] },
    ],
    deathPlayerIds: ["p8"],
    deathSummary: "Vy bị treo cổ sau ngày 1.",
  },
];

function buildPlayers(overrides: {
  deadPlayerIds?: string[];
  phaseReadyPlayerIds?: string[];
  votedPlayerIds?: string[];
  voteTargetByPlayerId?: Record<string, string | null>;
  revealRoles?: boolean;
}): ClassicWolfPlayState["players"] {
  const deadPlayerIds = overrides.deadPlayerIds ?? [];
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
    isHost: seed.isHost,
    isReady: true,
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: overrides.revealRoles || seed.id === "p1" ? seed.role : null,
    isAlive: !deadPlayerIds.includes(seed.id),
    hasVoted: votedPlayerIds.includes(seed.id),
    voteTargetPlayerId: voteTargetByPlayerId[seed.id] ?? null,
    hasVoteSelection: Boolean(voteTargetByPlayerId[seed.id]),
    voteSelectionTargetPlayerId: voteTargetByPlayerId[seed.id] ?? null,
    isPhaseReady: phaseReadyPlayerIds.includes(seed.id),
  }));
}

function buildWolfPack(): ClassicWolfPlayState["wolfPack"] {
  return [
    {
      id: "p1",
      name: "Khánh",
      avatarKey: "img_1",
      avatarUrl: null,
      isAlive: true,
      isCurrentPlayer: true,
      hasSubmittedAction: false,
      selectedTargetPlayerId: "p7",
      selectedTargetName: "Ngọc",
    },
    {
      id: "p2",
      name: "Yun",
      avatarKey: "img_2",
      avatarUrl: null,
      isAlive: true,
      isCurrentPlayer: false,
      hasSubmittedAction: true,
      selectedTargetPlayerId: "p7",
      selectedTargetName: "Ngọc",
    },
  ];
}

function buildBaseState(phase: WolfGamePhase): ClassicWolfPlayState {
  return {
    room: DEBUG_ROOM,
    game: {
      id: "debug-game",
      phase,
      roundNumber: 2,
      discussionEndsAt: null,
      votingEndsAt: null,
    },
    players: buildPlayers({ deadPlayerIds: ["p8"] }),
    currentPlayerId: "p1",
    isCurrentPlayerHost: true,
    myRole: "werewolf",
    activeNightTurn: null,
    myNightAction: null,
    seerReveal: null,
    nightReminder: null,
    wolfPack: [],
    witchVictimPlayerId: null,
    previousGuardTargetPlayerId: null,
    pendingDeathEvent: null,
    deathEvents: [
      {
        roundNumber: 1,
        phase: "day",
        playerIds: ["p8"],
        reason: "Vy bị treo cổ sau ngày 1.",
      },
    ],
    phaseReadyPlayerIds: [],
    witchHealUsed: false,
    witchPoisonUsed: false,
    allVotesSubmitted: false,
    result: null,
    roleDeck: DEBUG_ROLE_DECK,
    nightHistory: DEBUG_NIGHT_HISTORY,
  };
}

export function buildDebugClassicWolfState(view: DebugClassicWolfView): ClassicWolfPlayState {
  if (view === "card_reveal") {
    const state = buildBaseState("card_reveal");

    return {
      ...state,
      game: { ...state.game, roundNumber: 1 },
      players: buildPlayers({ phaseReadyPlayerIds: ["p2", "p3", "p4"] }),
      phaseReadyPlayerIds: ["p2", "p3", "p4"],
      deathEvents: [],
      nightHistory: [],
    };
  }

  if (view === "night") {
    const state = buildBaseState("night");

    return {
      ...state,
      activeNightTurn: {
        role: "werewolf",
        playerIds: ["p1", "p2"],
        playerNames: ["Khánh", "Yun"],
        isAutoPass: false,
        autoPassEndsAt: null,
      },
      wolfPack: buildWolfPack(),
      nightReminder: {
        title: "Đêm 1",
        lines: ["Ma Sói đã cắn Ngọc.", "Không ai chết trong đêm 1."],
      },
    };
  }

  if (view === "night_review") {
    const state = buildBaseState("night_review");

    return {
      ...state,
      players: buildPlayers({ deadPlayerIds: ["p8", "p7"], phaseReadyPlayerIds: ["p3"] }),
      phaseReadyPlayerIds: ["p3"],
      pendingDeathEvent: {
        roundNumber: 2,
        phase: "night",
        playerIds: ["p7"],
        reason: "Sau đêm 2, người chết đã được công bố.",
      },
      deathEvents: [
        ...state.deathEvents,
        {
          roundNumber: 2,
          phase: "night",
          playerIds: ["p7"],
          reason: "Sau đêm 2, người chết đã được công bố.",
        },
      ],
    };
  }

  if (view === "day_review") {
    const state = buildBaseState("night_review");

    return {
      ...state,
      players: buildPlayers({
        deadPlayerIds: ["p8", "p7", "p4"],
        votedPlayerIds: ["p1", "p2", "p3", "p5", "p6"],
        voteTargetByPlayerId: { p1: "p4", p2: "p4", p3: "p4", p5: "p1", p6: null },
      }),
      pendingDeathEvent: {
        roundNumber: 2,
        phase: "day",
        playerIds: ["p4"],
        reason: "Lan Nè bị treo cổ sau ngày 2.",
      },
      deathEvents: [
        ...state.deathEvents,
        {
          roundNumber: 2,
          phase: "night",
          playerIds: ["p7"],
          reason: "Sau đêm 2, người chết đã được công bố.",
        },
        {
          roundNumber: 2,
          phase: "day",
          playerIds: ["p4"],
          reason: "Lan Nè bị treo cổ sau ngày 2.",
        },
      ],
    };
  }

  if (view === "discussion") {
    const state = buildBaseState("discussion");

    return {
      ...state,
      players: buildPlayers({ deadPlayerIds: ["p8", "p7"], phaseReadyPlayerIds: ["p2", "p5"] }),
      phaseReadyPlayerIds: ["p2", "p5"],
      nightReminder: {
        title: "Đêm 2",
        lines: ["Ma Sói đã cắn Ngọc.", "Ngọc đã chết."],
      },
    };
  }

  if (view === "voting") {
    const state = buildBaseState("voting");

    return {
      ...state,
      players: buildPlayers({
        deadPlayerIds: ["p8", "p7"],
        votedPlayerIds: ["p2", "p3"],
        voteTargetByPlayerId: { p2: "p4", p3: "p1" },
      }),
    };
  }

  const state = buildBaseState("result");

  return {
    ...state,
    players: buildPlayers({ deadPlayerIds: ["p8", "p7", "p4", "p5"], revealRoles: true }),
    result: {
      winnerTeam: "werewolves",
      winnerText: "Số Ma Sói đã bằng số dân còn lại. Phe Ma Sói thắng.",
    },
  };
}

export function normalizeDebugClassicWolfView(view?: string): DebugClassicWolfView {
  return DEBUG_CLASSIC_WOLF_VIEWS.includes(view as DebugClassicWolfView)
    ? (view as DebugClassicWolfView)
    : "discussion";
}
