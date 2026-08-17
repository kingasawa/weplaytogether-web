import {
  AVALON_PHASE_LABELS,
  getAvalonRoleTeam,
  type AvalonPhase,
  type AvalonRole,
  type AvalonTeamVote,
} from "@/lib/avalon-game";
import type { AvalonPlayState } from "../games/avalon/actions";

export const DEBUG_AVALON_ROLE_OPTIONS: AvalonRole[] = [
  "merlin",
  "percival",
  "morgana",
  "assassin",
  "loyal_servant",
  "mordred",
  "oberon",
  "minion",
];

const DEBUG_PLAYERS = [
  { id: "p1", name: "Khanh", avatarKey: "img_1" },
  { id: "p2", name: "Lan Ne", avatarKey: "img_2" },
  { id: "p3", name: "Tri", avatarKey: "img_3" },
  { id: "p4", name: "Dai Chua", avatarKey: "img_4" },
  { id: "p5", name: "Yunnnnn", avatarKey: "img_5" },
];

const DEBUG_FALLBACK_ROLE_BY_PLAYER_ID: Record<string, AvalonRole> = {
  p1: "merlin",
  p2: "percival",
  p3: "loyal_servant",
  p4: "assassin",
  p5: "morgana",
};

const DEBUG_PENDING_TEAM_VOTES: Record<string, AvalonTeamVote> = {
  p2: "approve",
  p4: "reject",
};

const DEBUG_COMPLETE_TEAM_VOTES: Record<string, AvalonTeamVote> = {
  ...DEBUG_PENDING_TEAM_VOTES,
  p1: "approve",
  p3: "approve",
  p5: "reject",
};

type BuildDebugAvalonStateInput = {
  phase: AvalonPhase;
  playerId?: string;
  role?: string;
  view?: string;
  votes?: string;
};

export function getDebugAvalonRole(role?: string, fallback: AvalonRole = "merlin") {
  return DEBUG_AVALON_ROLE_OPTIONS.includes(role as AvalonRole) ? (role as AvalonRole) : fallback;
}

function getRoleByPlayerId(currentRole: AvalonRole, currentPlayerId: string): Record<string, AvalonRole> {
  return {
    ...DEBUG_FALLBACK_ROLE_BY_PLAYER_ID,
    [currentPlayerId]: currentRole,
  };
}

function getDebugCurrentPlayerId(view: string | undefined, playerId: string | undefined, leaderPlayerId: string) {
  if (playerId && DEBUG_PLAYERS.some((player) => player.id === playerId)) {
    return playerId;
  }

  if (view === "leader") {
    return leaderPlayerId;
  }

  return "p1";
}

function getDebugTeamVotes(votes: string | undefined) {
  return votes === "complete" ? DEBUG_COMPLETE_TEAM_VOTES : DEBUG_PENDING_TEAM_VOTES;
}

function getDebugKnownPlayers(role: AvalonRole): AvalonPlayState["privateInfo"]["knownPlayers"] {
  if (role === "merlin") {
    return [
      {
        playerId: "p4",
        playerName: "Dai Chua",
        role: "assassin",
        loyalty: "evil",
        note: "Evil Merlin nhìn thấy",
      },
      {
        playerId: "p5",
        playerName: "Yunnnnn",
        role: "morgana",
        loyalty: "evil",
        note: "Evil Merlin nhìn thấy",
      },
    ];
  }

  if (role === "percival") {
    return [
      {
        playerId: "p1",
        playerName: "Khanh",
        role: null,
        loyalty: null,
        note: "",
      },
      {
        playerId: "p5",
        playerName: "Yunnnnn",
        role: null,
        loyalty: null,
        note: "",
      },
    ];
  }

  if (getAvalonRoleTeam(role) === "evil") {
    const knownPlayers: AvalonPlayState["privateInfo"]["knownPlayers"] = [
      {
        playerId: "p4",
        playerName: "Dai Chua",
        role: "assassin",
        loyalty: "evil",
        note: "Đồng đội Evil",
      },
      {
        playerId: "p5",
        playerName: "Yunnnnn",
        role: "morgana",
        loyalty: "evil",
        note: "Đồng đội Evil",
      },
    ];

    return knownPlayers.filter((player) => DEBUG_FALLBACK_ROLE_BY_PLAYER_ID[player.playerId] !== role);
  }

  return [];
}

function getQuestResults(phase: AvalonPhase): AvalonPlayState["questResults"] {
  if (phase === "role_reveal" || phase === "team_proposal" || phase === "team_vote" || phase === "quest") {
    return [];
  }

  const firstQuest = {
    questIndex: 0,
    questNumber: 1,
    teamPlayerIds: ["p1", "p3"],
    teamNames: ["Khanh", "Tri"],
    failCount: 0,
    requiredFails: 1,
    outcome: "success" as const,
    leaderPlayerId: "p1",
    leaderName: "Khanh",
    proposalAttempt: 1,
    votesByPlayerId: {
      p1: "approve" as const,
      p2: "approve" as const,
      p3: "approve" as const,
      p4: "reject" as const,
      p5: "reject" as const,
    },
    approveCount: 3,
    rejectCount: 2,
  };

  if (phase === "quest_reveal") {
    return [firstQuest];
  }

  const secondQuest = {
    questIndex: 1,
    questNumber: 2,
    teamPlayerIds: ["p2", "p4", "p5"],
    teamNames: ["Lan Ne", "Dai Chua", "Yunnnnn"],
    failCount: 1,
    requiredFails: 1,
    outcome: "fail" as const,
    leaderPlayerId: "p3",
    leaderName: "Tri",
    proposalAttempt: 2,
    votesByPlayerId: {
      p1: "reject" as const,
      p2: "approve" as const,
      p3: "approve" as const,
      p4: "approve" as const,
      p5: "approve" as const,
    },
    approveCount: 4,
    rejectCount: 1,
  };

  if (phase === "lady") {
    return [firstQuest, secondQuest];
  }

  const thirdQuest = {
    questIndex: 2,
    questNumber: 3,
    teamPlayerIds: ["p1", "p2"],
    teamNames: ["Khanh", "Lan Ne"],
    failCount: 0,
    requiredFails: 1,
    outcome: "success" as const,
    leaderPlayerId: "p2",
    leaderName: "Lan Ne",
    proposalAttempt: 1,
    votesByPlayerId: {
      p1: "approve" as const,
      p2: "approve" as const,
      p3: "approve" as const,
      p4: "reject" as const,
      p5: "reject" as const,
    },
    approveCount: 3,
    rejectCount: 2,
  };

  const fourthQuest = {
    questIndex: 3,
    questNumber: 4,
    teamPlayerIds: ["p1", "p2", "p3"],
    teamNames: ["Khanh", "Lan Ne", "Tri"],
    failCount: 0,
    requiredFails: 1,
    outcome: "success" as const,
    leaderPlayerId: "p1",
    leaderName: "Khanh",
    proposalAttempt: 1,
    votesByPlayerId: {
      p1: "approve" as const,
      p2: "approve" as const,
      p3: "approve" as const,
      p4: "reject" as const,
      p5: "reject" as const,
    },
    approveCount: 3,
    rejectCount: 2,
  };

  return [firstQuest, secondQuest, thirdQuest, fourthQuest];
}

function getPhaseDefaults(phase: AvalonPhase) {
  if (phase === "team_proposal") {
    return {
      leaderPlayerId: "p1",
      selectedTeamPlayerIds: [] as string[],
      proposedQuestIndex: 0,
      availableQuestIndexes: [0],
    };
  }

  if (phase === "team_vote") {
    return {
      leaderPlayerId: "p3",
      selectedTeamPlayerIds: ["p1", "p3"],
      proposedQuestIndex: 0,
      availableQuestIndexes: [0],
    };
  }

  if (phase === "quest") {
    return {
      leaderPlayerId: "p3",
      selectedTeamPlayerIds: ["p1", "p3"],
      proposedQuestIndex: 0,
      availableQuestIndexes: [0],
    };
  }

  if (phase === "quest_reveal") {
    return {
      leaderPlayerId: "p1",
      selectedTeamPlayerIds: ["p1", "p3"],
      proposedQuestIndex: 1,
      availableQuestIndexes: [1],
    };
  }

  if (phase === "lady") {
    return {
      leaderPlayerId: "p2",
      selectedTeamPlayerIds: ["p2", "p4", "p5"],
      proposedQuestIndex: 2,
      availableQuestIndexes: [2],
    };
  }

  return {
    leaderPlayerId: "p3",
    selectedTeamPlayerIds: [] as string[],
    proposedQuestIndex: 0,
    availableQuestIndexes: [0],
  };
}

export function buildDebugAvalonState({ phase, playerId, role, view, votes }: BuildDebugAvalonStateInput): AvalonPlayState {
  const phaseDefaults = getPhaseDefaults(phase);
  const currentPlayerId = getDebugCurrentPlayerId(view, playerId, phaseDefaults.leaderPlayerId);
  const teamVotesByPlayerId = getDebugTeamVotes(votes);
  const selectedRole = getDebugAvalonRole(role, phase === "assassination" ? "assassin" : "merlin");
  const loyalty = getAvalonRoleTeam(selectedRole);
  const roleByPlayerId = getRoleByPlayerId(selectedRole, currentPlayerId);
  const questResults = getQuestResults(phase);
  const successCount = questResults.filter((questResult) => questResult.outcome === "success").length;
  const failCount = questResults.filter((questResult) => questResult.outcome === "fail").length;
  const isResultPhase = phase === "result";
  const isTeamVotePhase = phase === "team_vote";
  const isQuestPhase = phase === "quest";
  const leaderName = DEBUG_PLAYERS.find((player) => player.id === phaseDefaults.leaderPlayerId)?.name ?? "Không rõ";
  const questReveal =
    phase === "quest_reveal"
      ? {
          questIndex: 1,
          revealedCount: 1,
          totalCount: 3,
          revealedCards: ["success" as const],
          isComplete: false,
        }
      : {
          questIndex: null,
          revealedCount: 0,
          totalCount: 0,
          revealedCards: [],
          isComplete: false,
        };

  return {
    room: {
      id: "debug-room",
      code: "demo",
      status: "playing",
      hostPlayerId: "p1",
      currentGameId: "debug-game",
    },
    game: {
      id: "debug-game",
      phase,
      phaseLabel: AVALON_PHASE_LABELS[phase],
      questIndex: phase === "quest_reveal" ? 1 : Math.min(questResults.length, 4),
      proposedQuestIndex: phaseDefaults.proposedQuestIndex,
      proposalAttempt: phase === "team_vote" ? 2 : 1,
    },
    players: DEBUG_PLAYERS.map((player) => {
      const playerRole = roleByPlayerId[player.id];
      const playerLoyalty = getAvalonRoleTeam(playerRole);
      const teamVote = isTeamVotePhase ? teamVotesByPlayerId[player.id] ?? null : null;

      return {
        id: player.id,
        name: player.name,
        avatarKey: player.avatarKey,
        isHost: player.id === "p1",
        isReady: true,
        joinedAt: "",
        role: isResultPhase || player.id === currentPlayerId ? playerRole : null,
        loyalty: isResultPhase || player.id === currentPlayerId ? playerLoyalty : null,
        isOnQuestTeam: phaseDefaults.selectedTeamPlayerIds.includes(player.id),
        hasConfirmedRole: phase !== "role_reveal",
        hasTeamVoted: Boolean(teamVote),
        teamVote,
        hasQuestSubmitted: isQuestPhase && player.id === "p3",
      };
    }),
    currentPlayerId,
    isCurrentPlayerHost: currentPlayerId === "p1",
    leaderPlayerId: phaseDefaults.leaderPlayerId,
    leaderName,
    selectedTeamPlayerIds: phaseDefaults.selectedTeamPlayerIds,
    requiredTeamSize: phaseDefaults.selectedTeamPlayerIds.length || 2,
    availableQuestIndexes: phaseDefaults.availableQuestIndexes,
    questResults,
    successCount,
    failCount,
    myRole: selectedRole,
    myLoyalty: loyalty,
    myTeamVote: null,
    myQuestCard: null,
    privateInfo: {
      roleDescription:
        selectedRole === "percival"
          ? "Thấy Merlin và Morgana, nhưng không biết ai là Morgana và ai là Merlin thật."
          : "Ghi nhớ vai và thông tin riêng trước khi xác nhận.",
      knownPlayers: getDebugKnownPlayers(selectedRole),
      ladyInspections:
        phase === "lady" || phase === "result"
          ? [
              {
                questNumber: 2,
                targetPlayerId: "p4",
                targetName: "Dai Chua",
                loyalty: "evil",
              },
            ]
          : [],
    },
    isTeamVoteRevealed: isTeamVotePhase && Object.keys(teamVotesByPlayerId).length >= DEBUG_PLAYERS.length,
    teamVoteCounts: {
      approve: Object.values(teamVotesByPlayerId).filter((vote) => vote === "approve").length,
      reject: Object.values(teamVotesByPlayerId).filter((vote) => vote === "reject").length,
    },
    questReveal,
    ladyOfLake: {
      enabled: phase === "lady" || phase === "result",
      holderPlayerId: phase === "lady" ? "p1" : null,
      holderName: phase === "lady" ? "Khanh" : "Không rõ",
      pendingAfterQuestIndex: phase === "lady" ? 1 : null,
      usedByPlayerIds: ["p2"],
    },
    assassination: {
      assassinPlayerId: "p1",
      targetPlayerId: phase === "result" ? "p3" : null,
      guessedCorrect: phase === "result" ? false : null,
    },
    result:
      phase === "result"
        ? {
            winnerTeam: "good",
            winnerText: "Good thắng",
            winnerReason: "Good hoàn thành 3 quest và Assassin đoán sai Merlin.",
          }
        : null,
    options: {
      rolePreset: "recommended",
      ladyOfLake: phase === "lady" || phase === "result",
      targeting: false,
    },
    roleDeckSummary: DEBUG_AVALON_ROLE_OPTIONS.map((debugRole) => ({
      role: debugRole,
      count: debugRole === "loyal_servant" || debugRole === "minion" ? 2 : 1,
    })),
  };
}
