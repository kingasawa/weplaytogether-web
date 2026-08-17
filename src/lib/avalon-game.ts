export type AvalonTeam = "good" | "evil";

export type AvalonRole =
  | "merlin"
  | "percival"
  | "loyal_servant"
  | "assassin"
  | "morgana"
  | "mordred"
  | "oberon"
  | "minion";

export type AvalonPhase =
  | "role_reveal"
  | "team_proposal"
  | "team_vote"
  | "quest"
  | "quest_reveal"
  | "lady"
  | "assassination"
  | "result";

export type AvalonRolePreset = "basic" | "recommended" | "custom";

export type AvalonQuestOutcome = "success" | "fail";

export type AvalonTeamVote = "approve" | "reject";

export type AvalonQuestCard = "success" | "fail";

export const AVALON_MIN_PLAYERS = 5;
export const AVALON_MAX_PLAYERS = 10;
export const AVALON_GAME_KEY = "avalon";

export const AVALON_ROLE_LABELS: Record<AvalonRole, string> = {
  merlin: "Merlin",
  percival: "Percival",
  loyal_servant: "Loyal Servant",
  assassin: "Assassin",
  morgana: "Morgana",
  mordred: "Mordred",
  oberon: "Oberon",
  minion: "Minion",
};

export const AVALON_ROLE_DESCRIPTIONS: Record<AvalonRole, string> = {
  merlin: "Biết các người chơi Evil, trừ Mordred. Dẫn dắt phe Good mà không để Assassin nhận ra.",
  percival: "Thấy Merlin và Morgana, nhưng không biết ai là Morgana và ai là Merlin thật.",
  loyal_servant: "Không có thông tin riêng. Theo dõi đội được đề cử, phiếu vote và kết quả quest.",
  assassin: "Evil. Nếu Good hoàn thành 3 quest, chọn một người Good để đoán Merlin.",
  morgana: "Evil. Xuất hiện như Merlin trước mắt Percival.",
  mordred: "Evil. Ẩn khỏi Merlin trong phần thông tin đầu game.",
  oberon: "Evil. Không biết đồng đội Evil và đồng đội Evil cũng không biết Oberon.",
  minion: "Evil. Biết các đồng đội Evil, trừ Oberon, và có thể sabotage quest.",
};

export const AVALON_ROLE_CARD_IMAGES: Record<AvalonRole, { alt: string; src: string }> = {
  merlin: { alt: "Lá bài Merlin", src: "/images/boards/cards/avalon/merlin.png" },
  percival: { alt: "Lá bài Percival", src: "/images/boards/cards/avalon/percival.png" },
  loyal_servant: { alt: "Lá bài Loyal Servant", src: "/images/boards/cards/avalon/servant.png" },
  assassin: { alt: "Lá bài Assassin", src: "/images/boards/cards/avalon/assassin.png" },
  morgana: { alt: "Lá bài Morgana", src: "/images/boards/cards/avalon/morgana.png" },
  mordred: { alt: "Lá bài Mordred", src: "/images/boards/cards/avalon/mordred.png" },
  oberon: { alt: "Lá bài Oberon", src: "/images/boards/cards/avalon/oberon.png" },
  minion: { alt: "Lá bài Minion", src: "/images/boards/cards/avalon/minion.png" },
};

export function getAvalonRoleImagePath(role: AvalonRole) {
  return AVALON_ROLE_CARD_IMAGES[role].src;
}

export const AVALON_PHASE_LABELS: Record<AvalonPhase, string> = {
  role_reveal: "Xem vai",
  team_proposal: "Chọn đội",
  team_vote: "Vote đội",
  quest: "Nhiệm vụ",
  quest_reveal: "Mở bài quest",
  lady: "Lady of the Lake",
  assassination: "Assassin đoán Merlin",
  result: "Kết quả",
};

export const AVALON_ROLE_ORDER: AvalonRole[] = [
  "merlin",
  "percival",
  "loyal_servant",
  "assassin",
  "morgana",
  "mordred",
  "oberon",
  "minion",
];

export const AVALON_ROLE_LIMITS: Record<AvalonRole, number> = {
  merlin: 1,
  percival: 1,
  loyal_servant: 6,
  assassin: 1,
  morgana: 1,
  mordred: 1,
  oberon: 1,
  minion: 4,
};

export const AVALON_PLAYER_RULES: Record<
  number,
  {
    good: number;
    evil: number;
    questTeamSizes: [number, number, number, number, number];
  }
> = {
  5: { good: 3, evil: 2, questTeamSizes: [2, 3, 2, 3, 3] },
  6: { good: 4, evil: 2, questTeamSizes: [2, 3, 4, 3, 4] },
  7: { good: 4, evil: 3, questTeamSizes: [2, 3, 3, 4, 4] },
  8: { good: 5, evil: 3, questTeamSizes: [3, 4, 4, 5, 5] },
  9: { good: 6, evil: 3, questTeamSizes: [3, 4, 4, 5, 5] },
  10: { good: 6, evil: 4, questTeamSizes: [3, 4, 4, 5, 5] },
};

export function getAvalonPlayerRules(playerCount: number) {
  return AVALON_PLAYER_RULES[playerCount] ?? null;
}

export function getAvalonRoleTeam(role: AvalonRole): AvalonTeam {
  return role === "merlin" || role === "percival" || role === "loyal_servant"
    ? "good"
    : "evil";
}

export function isAvalonEvilRole(role: AvalonRole) {
  return getAvalonRoleTeam(role) === "evil";
}

export function getAvalonQuestRequiredFails(playerCount: number, questIndex: number) {
  return playerCount >= 7 && questIndex === 3 ? 2 : 1;
}

export function getAvalonQuestTeamSize(playerCount: number, questIndex: number) {
  return getAvalonPlayerRules(playerCount)?.questTeamSizes[questIndex] ?? 0;
}

export function getAvalonSequentialNextQuestIndex(completedQuestIndexes: number[]) {
  for (let index = 0; index < 5; index += 1) {
    if (!completedQuestIndexes.includes(index)) {
      return index;
    }
  }

  return 4;
}

export function getAvailableAvalonQuestIndexes(completedQuestIndexes: number[]) {
  const nextQuestIndex = getAvalonSequentialNextQuestIndex(completedQuestIndexes);
  return completedQuestIndexes.includes(nextQuestIndex) ? [] : [nextQuestIndex];
}

export function buildBasicAvalonDeck(playerCount: number): AvalonRole[] {
  const rules = getAvalonPlayerRules(playerCount);

  if (!rules) {
    return [];
  }

  return [
    "merlin",
    ...Array.from({ length: rules.good - 1 }, () => "loyal_servant" as const),
    "assassin",
    ...Array.from({ length: rules.evil - 1 }, () => "minion" as const),
  ];
}

export function buildRecommendedAvalonDeck(playerCount: number): AvalonRole[] {
  const rules = getAvalonPlayerRules(playerCount);

  if (!rules) {
    return [];
  }

  const goodRoles: AvalonRole[] = ["merlin"];
  const evilRoles: AvalonRole[] = ["assassin"];

  if (rules.good >= 3) {
    goodRoles.push("percival");
  }

  if (rules.evil >= 2) {
    evilRoles.push("morgana");
  }

  if (playerCount >= 7 && rules.evil >= 3) {
    evilRoles.push("mordred");
  }

  if (playerCount >= 10 && rules.evil >= 4) {
    evilRoles.push("oberon");
  }

  while (goodRoles.length < rules.good) {
    goodRoles.push("loyal_servant");
  }

  while (evilRoles.length < rules.evil) {
    evilRoles.push("minion");
  }

  return [...goodRoles, ...evilRoles];
}

export function getDefaultAvalonDeck(playerCount: number, preset: AvalonRolePreset) {
  return preset === "basic" ? buildBasicAvalonDeck(playerCount) : buildRecommendedAvalonDeck(playerCount);
}

export type AvalonDeckValidationResult =
  | {
      ok: true;
      roles: AvalonRole[];
    }
  | {
      ok: false;
      error: string;
    };

export function validateAvalonDeck(
  playerCount: number,
  roles: AvalonRole[] | undefined,
  preset: AvalonRolePreset
): AvalonDeckValidationResult {
  const rules = getAvalonPlayerRules(playerCount);

  if (!rules) {
    return { ok: false, error: "Avalon cần từ 5 đến 10 người chơi." };
  }

  const selectedRoles = roles?.length ? roles : getDefaultAvalonDeck(playerCount, preset);

  if (selectedRoles.length !== playerCount) {
    return { ok: false, error: `Cần chọn đúng ${playerCount} role cho ${playerCount} người chơi.` };
  }

  if (selectedRoles.some((role) => !AVALON_ROLE_ORDER.includes(role))) {
    return { ok: false, error: "Danh sách role Avalon không hợp lệ." };
  }

  if (!selectedRoles.includes("merlin")) {
    return { ok: false, error: "Ván Avalon cần có Merlin." };
  }

  if (!selectedRoles.includes("assassin")) {
    return { ok: false, error: "Ván Avalon cần có Assassin." };
  }

  const goodCount = selectedRoles.filter((role) => getAvalonRoleTeam(role) === "good").length;
  const evilCount = selectedRoles.length - goodCount;

  if (goodCount !== rules.good || evilCount !== rules.evil) {
    return {
      ok: false,
      error: `Bàn ${playerCount} người cần ${rules.good} Good và ${rules.evil} Evil.`,
    };
  }

  for (const role of AVALON_ROLE_ORDER) {
    const roleCount = selectedRoles.filter((selectedRole) => selectedRole === role).length;

    if (roleCount > AVALON_ROLE_LIMITS[role]) {
      return {
        ok: false,
        error: `${AVALON_ROLE_LABELS[role]} chỉ được chọn tối đa ${AVALON_ROLE_LIMITS[role]}.`,
      };
    }
  }

  return { ok: true, roles: selectedRoles };
}
