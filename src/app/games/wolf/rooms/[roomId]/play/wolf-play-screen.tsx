"use client";

import { ArrowRight, ArrowUp, Check, CircleAlert, History, LoaderCircle, LogOut, RotateCcw, Users, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type PointerEvent } from "react";
import { getPlayerAvatarSrc } from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import type { WolfRole } from "@/lib/supabase/types";
import {
  getWolfRoleImagePath,
  WOLF_PHASE_LABELS,
  WOLF_ROLE_DESCRIPTIONS,
  WOLF_ROLE_LABELS,
} from "@/lib/wolf-game";
import {
  confirmWolfNightActionResult,
  finishWolfGame,
  getWolfPlayState,
  leaveWolfRoom,
  revealWolfCenterCard,
  revealWolfPlayerCard,
  submitWolfPhaseConfirmation,
  submitWolfNightAction,
  submitWolfVote,
  type WolfCenterRevealResult,
  type WolfGameResult,
  type WolfPlayPlayer,
  type WolfPlayState,
  type WolfPlayerRevealResult,
} from "../../../actions";
import styles from "../../../page.module.css";

type WolfPlayScreenProps = {
  initialState: WolfPlayState;
};

const VOTE_SKIP_KEY = "__skip_vote__";
const PRIVATE_CARD_COVER_IMAGE_PATH = "/images/ui/mask_card.png";

type RevealedCenterCard = Extract<WolfCenterRevealResult, { ok: true }>;
type RevealedPlayerCard = Extract<WolfPlayerRevealResult, { ok: true }>;
type WolfTeam = WolfGameResult["winnerTeam"];

const WOLF_ROLE_TEAMS: Record<WolfRole, WolfTeam> = {
  werewolf: "werewolves",
  werewolf_seer: "werewolves",
  villager: "villagers",
  seer: "villagers",
  robber: "villagers",
  troublemaker: "villagers",
  witch: "villagers",
  drunk: "villagers",
  insomniac: "villagers",
  doppelganger: "villagers",
  copycat: "villagers",
};

const WOLF_ROLE_WIN_CONDITIONS: Record<WolfRole, string> = {
  werewolf: "Thắng cùng phe sói: phe sói thắng khi không có Ma Sói nào bị treo.",
  werewolf_seer: "Thắng cùng phe sói: phe sói thắng khi không có Ma Sói nào bị treo.",
  villager: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  seer: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  robber: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  troublemaker: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  witch: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  drunk: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  insomniac: "Thắng cùng phe dân: dân làng thắng khi treo được Ma Sói. Nếu không có Ma Sói, dân thắng khi không ai bị treo.",
  doppelganger: "Thắng theo chức năng đã nhân bản trong đêm.",
  copycat: "Thắng cùng phe dân theo luật hiện tại của game.",
};

type RoleCardProps = {
  role: WolfRole | null;
  label: string;
  isHidden?: boolean;
  isFocusedReveal?: boolean;
};

function isPrivateRevealPhase(phase: WolfPlayState["game"]["phase"]) {
  return phase === "card_reveal" || phase === "night_review";
}

function RoleCard({ role, label, isHidden = false, isFocusedReveal = false }: RoleCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const roleLabel = role ? WOLF_ROLE_LABELS[role] : "Úp bài";
  const roleImagePath = role && !isHidden ? getWolfRoleImagePath(role) : null;
  const shouldShowRoleImage = Boolean(roleImagePath && !imageFailed);

  return (
    <article
      aria-label={role ? roleLabel : label}
      className={`${styles.playCard} ${shouldShowRoleImage ? styles.roleImageCard : ""} ${
        isFocusedReveal ? styles.cardRevealRoleCard : ""
      } ${isHidden ? styles.playCardHidden : ""}`}
    >
      {!shouldShowRoleImage && <span>{label}</span>}
      {roleImagePath && !imageFailed && (
        <Image
          alt={roleLabel}
          className={styles.roleCardImage}
          fill
          priority={isFocusedReveal}
          sizes="(max-width: 768px) 33vw, 16rem"
          src={roleImagePath}
          onError={() => setImageFailed(true)}
        />
      )}
      {(!role || !roleImagePath || imageFailed) && <strong>{isHidden ? "?" : roleLabel}</strong>}
    </article>
  );
}

function getPlayerName(players: WolfPlayPlayer[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "Không rõ";
}

function getResultPlayerName(
  players: WolfPlayPlayer[],
  allPlayersSummary: WolfPlayState["allPlayersSummary"],
  playerId: string | null
) {
  return (
    allPlayersSummary?.find((playerSummary) => playerSummary.playerId === playerId)?.playerName ??
    getPlayerName(players, playerId)
  );
}

function getWolfRoleTeam(role: WolfRole | null) {
  return role ? WOLF_ROLE_TEAMS[role] : null;
}

export default function WolfPlayScreen({ initialState }: WolfPlayScreenProps) {
  const router = useRouter();
  const [playState, setPlayState] = useState(initialState);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedCenterIndexes, setSelectedCenterIndexes] = useState<number[]>([]);
  const [revealedCenterCards, setRevealedCenterCards] = useState<RevealedCenterCard[]>([]);
  const [revealedPlayerCards, setRevealedPlayerCards] = useState<RevealedPlayerCard[]>([]);
  const [revealingCenterIndexes, setRevealingCenterIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [optimisticVoteTargetPlayerId, setOptimisticVoteTargetPlayerId] = useState<string | null>(null);
  const [selectedVoteTargetPlayerId, setSelectedVoteTargetPlayerId] = useState<string | null>(null);
  const [unlockedPrivateRevealKey, setUnlockedPrivateRevealKey] = useState<string | null>(
    isPrivateRevealPhase(initialState.game.phase) ? null : `${initialState.game.id}:${initialState.game.phase}`
  );
  const [coverPointerStartY, setCoverPointerStartY] = useState<number | null>(null);
  const [coverDragOffset, setCoverDragOffset] = useState(0);
  const [selectedRoleGuide, setSelectedRoleGuide] = useState<WolfRole | null>(null);
  const [openNightReminderKey, setOpenNightReminderKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const myRole = playState.myCard?.originalRole ?? null;
  const currentPlayer = playState.players.find((player) => player.id === playState.currentPlayerId) ?? null;
  const activeNightTurn = playState.activeNightTurn;
  const isMyNightTurn = Boolean(
    playState.game.phase === "night" &&
      activeNightTurn &&
      activeNightTurn.playerId === playState.currentPlayerId
  );
  const nightActionRole = isMyNightTurn ? activeNightTurn?.activeRole ?? myRole : myRole;
  const isCopycatCopyTurn = Boolean(isMyNightTurn && myRole === "copycat" && nightActionRole === "copycat");
  const isCopycatCopiedRoleTurn = Boolean(
    isMyNightTurn && myRole === "copycat" && activeNightTurn?.isCopycatCopiedRole
  );
  const otherPlayers = playState.players.filter((player) => player.id !== playState.currentPlayerId);
  const getRevealedCenterRole = (centerIndex: number) =>
    revealedCenterCards.find((card) => card.centerIndex === centerIndex)?.role ??
    playState.centerCards.find((card) => card.index === centerIndex)?.role ??
    null;
  const getCenterWolfCheck = (centerIndex: number) => {
    const localReveal = revealedCenterCards.find((card) => card.centerIndex === centerIndex);

    if (typeof localReveal?.isWerewolf === "boolean") {
      return localReveal.isWerewolf;
    }

    const stateReveal = playState.centerCards.find((card) => card.index === centerIndex);

    return typeof stateReveal?.isWerewolf === "boolean" ? stateReveal.isWerewolf : null;
  };
  const getCenterRevealLabel = (centerIndex: number) => {
    const role = getRevealedCenterRole(centerIndex);

    if (role) {
      return WOLF_ROLE_LABELS[role];
    }

    const isWerewolf = getCenterWolfCheck(centerIndex);

    if (typeof isWerewolf === "boolean") {
      return isWerewolf ? "Sói" : "Không phải Sói";
    }

    return null;
  };
  const hasCenterReveal = (centerIndex: number) => Boolean(getRevealedCenterRole(centerIndex)) || typeof getCenterWolfCheck(centerIndex) === "boolean";
  const viewedCenterIndexes = playState.centerCards
    .filter((card) => hasCenterReveal(card.index))
    .map((card) => card.index);
  const copiedCenterIndex =
    myRole === "copycat"
      ? isCopycatCopiedRoleTurn
        ? playState.myAction?.targetCenterIndex ?? null
        : selectedCenterIndexes[0] ?? playState.myAction?.targetCenterIndex ?? null
      : null;
  const copycatCopiedRole =
    myRole === "copycat" && copiedCenterIndex != null
      ? getRevealedCenterRole(copiedCenterIndex)
      : null;
  const currentTurnViewedCenterIndexes =
    isCopycatCopiedRoleTurn && copiedCenterIndex != null
      ? viewedCenterIndexes.filter((centerIndex) => centerIndex !== copiedCenterIndex)
      : viewedCenterIndexes;
  const doppelgangerCopiedPlayerId =
    myRole === "doppelganger" ? selectedPlayerIds[0] ?? playState.myAction?.targetPlayerId ?? null : null;
  const doppelgangerCopiedRole =
    myRole === "doppelganger" && doppelgangerCopiedPlayerId
      ? revealedPlayerCards.find((card) => card.playerId === doppelgangerCopiedPlayerId)?.role ??
        playState.playerReveals.find((card) => card.playerId === doppelgangerCopiedPlayerId)?.role ??
        playState.activeNightTurn?.copiedRole ??
        null
      : null;
  const isCopycatDoppelgangerTurn = Boolean(isCopycatCopiedRoleTurn && copycatCopiedRole === "doppelganger");
  const copycatDoppelgangerCopiedPlayerId = isCopycatDoppelgangerTurn
    ? selectedPlayerIds[0] ?? playState.myAction?.targetPlayerId ?? null
    : null;
  const copycatDoppelgangerCopiedRole =
    isCopycatDoppelgangerTurn && copycatDoppelgangerCopiedPlayerId
      ? revealedPlayerCards.find((card) => card.playerId === copycatDoppelgangerCopiedPlayerId)?.role ??
        playState.playerReveals.find((card) => card.playerId === copycatDoppelgangerCopiedPlayerId)?.role ??
        (playState.activeNightTurn?.activeRole === "doppelganger"
          ? playState.activeNightTurn.copiedRole
          : null) ??
        null
      : null;
  const activeDoppelgangerCopiedPlayerId =
    myRole === "doppelganger" ? doppelgangerCopiedPlayerId : copycatDoppelgangerCopiedPlayerId;
  const activeDoppelgangerCopiedRole =
    myRole === "doppelganger" ? doppelgangerCopiedRole : copycatDoppelgangerCopiedRole;
  const doppelgangerActionTargetIds = myRole === "doppelganger" ? selectedPlayerIds.slice(1) : [];
  const copycatDoppelgangerActionTargetIds = isCopycatDoppelgangerTurn ? selectedPlayerIds.slice(1) : [];
  const isActingAsDoppelganger = Boolean(
    nightActionRole === "doppelganger" && (myRole === "doppelganger" || isCopycatDoppelgangerTurn)
  );
  const activeDoppelgangerActionTargetIds =
    myRole === "doppelganger" ? doppelgangerActionTargetIds : copycatDoppelgangerActionTargetIds;
  const activeActionTargetIds = isActingAsDoppelganger
    ? activeDoppelgangerActionTargetIds
    : selectedPlayerIds;
  const effectiveNightActionRole =
    nightActionRole === "doppelganger" && activeDoppelgangerCopiedRole
      ? activeDoppelgangerCopiedRole
      : nightActionRole;
  const isDoppelgangerCopycatOnly = isActingAsDoppelganger && activeDoppelgangerCopiedRole === "copycat";
  const isSeerEffect = effectiveNightActionRole === "seer";
  const selectedSeerFoundWolf = selectedCenterIndexes.some((centerIndex) => getCenterWolfCheck(centerIndex) === true);
  const isSeerSelectionComplete = (centerIndexes: number[]) => {
    const firstCenterIndex = centerIndexes[0];

    if (firstCenterIndex == null) {
      return false;
    }

    const firstWolfCheck = getCenterWolfCheck(firstCenterIndex);

    if (firstWolfCheck === true) {
      return centerIndexes.length === 1;
    }

    return firstWolfCheck === false && centerIndexes.length === 2;
  };
  const usesTroublemakerSelection = effectiveNightActionRole === "troublemaker";
  const usesWitchSelection = effectiveNightActionRole === "witch";
  const playerPickerOptions = usesWitchSelection ? playState.players : otherPlayers;
  const hasWerewolfTeammates =
    (myRole === "werewolf" || myRole === "werewolf_seer" || myRole === "copycat" || myRole === "doppelganger") &&
    playState.werewolfTeammates.length > 0;
  const copycatWerewolfTeammates =
    myRole === "copycat" &&
    copycatCopiedRole &&
    WOLF_ROLE_TEAMS[copycatCopiedRole] === "werewolves"
      ? revealedCenterCards.find((card) => card.centerIndex === copiedCenterIndex)?.werewolfTeammates ?? []
      : [];
  const shouldShowWerewolfTeammatePanel =
    hasWerewolfTeammates ||
    (myRole === "copycat" && copycatCopiedRole && WOLF_ROLE_TEAMS[copycatCopiedRole] === "werewolves");
  const werewolfTeammateNames = hasWerewolfTeammates
    ? playState.werewolfTeammates.map((player) => player.playerName)
    : copycatWerewolfTeammates.map((player) => player.playerName);
  const nightResultActionRole =
    playState.myAction?.actionType === "copycat"
      ? copycatCopiedRole
      : playState.myAction?.actionType === "doppelganger"
        ? doppelgangerCopiedRole
        : (playState.myAction?.actionType as WolfRole | undefined) ?? null;
  const nightResultSummary =
    playState.myCard?.nightReviewRole
      ? `Kết quả: ${myRole === "insomniac" ? "bài hiện tại" : "bài vừa lấy"} là ${
          WOLF_ROLE_LABELS[playState.myCard.nightReviewRole]
        }.`
      : nightResultActionRole === "troublemaker"
        ? `Kết quả: bài của ${getPlayerName(
            playState.players,
            playState.myAction?.actionType === "doppelganger"
              ? playState.myAction.targetPlayerId2
              : playState.myAction?.targetPlayerId ?? null
          )} và ${getPlayerName(
            playState.players,
            playState.myAction?.actionType === "doppelganger"
              ? playState.myAction.targetPlayerId3
              : playState.myAction?.targetPlayerId2 ?? null
          )} đã đổi vị trí.`
        : null;
  const isCardRevealPhase = playState.game.phase === "card_reveal";
  const isNightPhase = playState.game.phase === "night";
  const isNightReviewPhase = playState.game.phase === "night_review";
  const isDiscussionPhase = playState.game.phase === "discussion";
  const isVotingPhase = playState.game.phase === "voting";
  const isResultPhase = playState.game.phase === "result";
  const activeVoteTargetPlayerId =
    optimisticVoteTargetPlayerId ??
    selectedVoteTargetPlayerId ??
    (currentPlayer?.hasSkippedVote ||
    (isVotingPhase && currentPlayer?.hasVoted && playState.myVoteTargetPlayerId === null)
      ? VOTE_SKIP_KEY
      : playState.myVoteTargetPlayerId);
  const submittedVotesCount = playState.players.filter((player) => player.hasVoted).length;
  const skippedVotesCount =
    playState.result?.skippedVoteCount ??
    playState.players.filter((player) => player.hasVoted && player.hasSkippedVote).length;
  const pendingVotesCount = Math.max(0, playState.players.length - submittedVotesCount);
  const votersByTarget = new Map<string, WolfPlayPlayer[]>();

  for (const player of playState.players) {
    const localVoteSelection =
      player.id === playState.currentPlayerId && !player.hasVoted
        ? optimisticVoteTargetPlayerId ?? selectedVoteTargetPlayerId
        : null;
    const voteTargetPlayerId = player.hasVoted
      ? player.voteTargetPlayerId
      : localVoteSelection && localVoteSelection !== VOTE_SKIP_KEY
        ? localVoteSelection
        : null;

    if (voteTargetPlayerId) {
      const voters = votersByTarget.get(voteTargetPlayerId) ?? [];

      if (!voters.some((voter) => voter.id === player.id)) {
        votersByTarget.set(voteTargetPlayerId, [...voters, player]);
      }
    }
  }

  const canConfirmVote =
    isVotingPhase &&
    Boolean(currentPlayer) &&
    !currentPlayer?.hasVoted &&
    activeVoteTargetPlayerId !== null &&
    !isPending;
  const maxVoteCount = playState.result
    ? playState.result.voteCounts.reduce((max, voteCount) => Math.max(max, voteCount.votes), 0)
    : 0;
  const currentPlayerResultTeam = getWolfRoleTeam(playState.myCard?.currentRole ?? null);
  const isCurrentPlayerWinner =
    playState.result && currentPlayerResultTeam
      ? playState.result.winnerTeam === currentPlayerResultTeam
      : null;
  const roleDeckSummary = playState.roleDeck.reduce<Array<{ role: WolfRole; count: number }>>(
    (summary, role) => {
      const existingRole = summary.find((item) => item.role === role);

      if (existingRole) {
        existingRole.count += 1;
        return summary;
      }

      return [...summary, { role, count: 1 }];
    },
    []
  );
  const hasFocusedWaitingStatus =
    isCardRevealPhase || isNightPhase || isNightReviewPhase || isDiscussionPhase || isVotingPhase;
  const usesFocusedRevealLayout = isCardRevealPhase || isNightReviewPhase;
  const hasFixedBottomActionBar = Boolean((isNightPhase && isMyNightTurn && myRole) || isDiscussionPhase);
  const hasFixedBottomWaitingOnly = (isNightPhase && !hasFixedBottomActionBar) || isVotingPhase;
  const privateRevealKey = isPrivateRevealPhase(playState.game.phase)
    ? `${playState.game.id}:${playState.game.phase}`
    : null;
  const privateRevealUnlocked = privateRevealKey === null || unlockedPrivateRevealKey === privateRevealKey;
  const isCenterRevealPending = revealingCenterIndexes.length > 0;
  const copiedSeerCenterPathStarted =
    myRole === "copycat" &&
    copycatCopiedRole === "seer" &&
    currentTurnViewedCenterIndexes.length > 0;
  const centerRevealLimit =
    effectiveNightActionRole === "seer"
      ? 2
      : effectiveNightActionRole === "witch"
        ? 1
        : effectiveNightActionRole === "werewolf" && !isActingAsDoppelganger && !hasWerewolfTeammates
          ? 1
          : effectiveNightActionRole === "copycat" && !isDoppelgangerCopycatOnly
            ? 1
            : 0;
  const refreshPlayState = useCallback(async () => {
    const nextState = await getWolfPlayState(playState.room.code);

    if (!nextState) {
      router.push(`/games/wolf/rooms/${playState.room.code}`);
      return;
    }

    setPlayState(nextState);
  }, [playState.room.code, router]);

  const { isPresenceReady } = useWolfRoomPresence({
    enabled: Boolean(playState.currentPlayerId),
    roomCode: playState.room.code,
    onPlayUpdate: refreshPlayState,
  });

  useEffect(() => {
    if (!playState.currentPlayerId || playState.game.phase === "result") {
      return;
    }

    const fallbackRefreshInterval = window.setInterval(() => {
      void refreshPlayState();
    }, isPresenceReady ? 8000 : 2500);

    return () => {
      window.clearInterval(fallbackRefreshInterval);
    };
  }, [isPresenceReady, playState.currentPlayerId, playState.game.phase, refreshPlayState]);

  function getWaitingPlayers() {
    if (playState.game.phase === "card_reveal" || playState.game.phase === "night_review") {
      return playState.players.filter((player) => !player.isPhaseReady);
    }

    if (playState.game.phase === "night") {
      return [];
    }

    if (playState.game.phase === "discussion") {
      return playState.players.filter((player) => !player.isPhaseReady);
    }

    if (playState.game.phase === "voting") {
      return playState.players.filter((player) => !player.hasVoted);
    }

    return [];
  }

  function getWaitingStatusText() {
    const waitingPlayers = getWaitingPlayers();

    if (playState.game.phase === "result") {
      return "Ván đã có kết quả.";
    }

    if (playState.game.phase === "night") {
      if (activeNightTurn) {
        return "Đến lượt bạn thực hiện chức năng.";
      }

      return playState.isNightTurnInProgress
        ? "Đang chờ người chơi khác thực hiện lượt ban đêm."
        : "Tất cả lượt ban đêm đã hoàn tất.";
    }

    if (waitingPlayers.length === 0) {
      return "Tất cả người chơi đã hoàn tất.";
    }

    if (waitingPlayers.length > 2) {
      return `Đang chờ ${waitingPlayers.length} người`;
    }

    if (waitingPlayers.length === 2) {
      return `Đang chờ ${waitingPlayers[0].name} và ${waitingPlayers[1].name}`;
    }

    return `Đang chờ ${waitingPlayers[0].name}`;
  }

  async function revealPlayerCard(playerId: string) {
    try {
      const result = await revealWolfPlayerCard(playState.room.code, playerId);

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setRevealedPlayerCards((current) => [
        ...current.filter((card) => card.playerId !== result.playerId),
        result,
      ]);
    } catch {
      setMessage("Không thể nhân bản người chơi đã chọn. Vui lòng thử lại.");
    }
  }

  function togglePlayerSelection(playerId: string) {
    setMessage("");
    if (isActingAsDoppelganger) {
      const copiedPlayerId = activeDoppelgangerCopiedPlayerId;
      const isChoosingCopiedPlayer = !copiedPlayerId || !activeDoppelgangerCopiedRole;

      if (isChoosingCopiedPlayer) {
        setSelectedPlayerIds([playerId]);
        setSelectedCenterIndexes([]);
        setRevealedCenterCards([]);
        void revealPlayerCard(playerId);
        return;
      }

      if (activeDoppelgangerCopiedRole === "seer" && viewedCenterIndexes.length > 0) {
        setMessage("Nhân Bản copy Tiên Tri đã xem lá giữa thì không thể chuyển sang xem người chơi.");
        return;
      }

      setSelectedPlayerIds((current) => {
        const copiedId = current[0] ?? copiedPlayerId;
        const targets = current.slice(1);

        if (usesTroublemakerSelection) {
          if (targets.includes(playerId)) {
            return [copiedId, ...targets.filter((id) => id !== playerId)];
          }

          return [copiedId, ...[...targets, playerId].slice(-2)];
        }

        return targets.includes(playerId) ? [copiedId] : [copiedId, playerId];
      });
      return;
    }

    if (myRole === "seer" && viewedCenterIndexes.length > 0) {
      setMessage("Tiên Tri đã xem lá giữa thì không thể chuyển sang xem người chơi.");
      return;
    }

    if (copiedSeerCenterPathStarted) {
      setMessage("Bạn đã dùng lượt soi lá giữa nên không thể chuyển sang xem người chơi.");
      return;
    }

    if (myRole === "seer") {
      setSelectedCenterIndexes([]);
    }

    if (myRole === "copycat" && (copycatCopiedRole === "seer" || copycatCopiedRole === "werewolf_seer")) {
      setSelectedCenterIndexes((current) => current.slice(0, 1));
    }

    setSelectedPlayerIds((current) => {
      if (usesTroublemakerSelection) {
        if (current.includes(playerId)) {
          return current.filter((id) => id !== playerId);
        }

        return [...current, playerId].slice(-2);
      }

      return current.includes(playerId) ? [] : [playerId];
    });
  }

  async function revealCenterCard(centerIndex: number) {
    if (!isMyNightTurn) {
      setMessage("Chưa tới lượt của bạn.");
      return;
    }

    if (hasCenterReveal(centerIndex) || revealingCenterIndexes.includes(centerIndex)) {
      return;
    }

    setRevealingCenterIndexes((current) =>
      current.includes(centerIndex) ? current : [...current, centerIndex]
    );
    try {
      const result = await revealWolfCenterCard(
        playState.room.code,
        centerIndex,
        effectiveNightActionRole,
        activeDoppelgangerCopiedPlayerId
      );

      if (!result.ok) {
        setMessage(result.error);
        setRevealingCenterIndexes((current) => current.filter((index) => index !== centerIndex));
        return;
      }

      setRevealedCenterCards((current) => [
        ...current.filter((card) => card.centerIndex !== result.centerIndex),
        result,
      ]);
      setRevealingCenterIndexes((current) => current.filter((index) => index !== centerIndex));
    } catch {
      setMessage("Không thể xem lá giữa bàn. Vui lòng thử lại.");
      setRevealingCenterIndexes((current) => current.filter((index) => index !== centerIndex));
    }
  }

  function toggleCenterSelection(centerIndex: number) {
    setMessage("");
    const canRevealCenterImmediately =
      effectiveNightActionRole === "seer" ||
      effectiveNightActionRole === "witch" ||
      (myRole === "copycat" &&
        ((isCopycatCopyTurn && selectedCenterIndexes.length === 0) ||
          (isCopycatCopiedRoleTurn &&
            (copycatCopiedRole === "seer" || copycatCopiedRole === "witch")))) ||
      (effectiveNightActionRole === "werewolf" && !isActingAsDoppelganger && !hasWerewolfTeammates);
    const isDeselecting = selectedCenterIndexes.includes(centerIndex);
    const isCopycatCopiedCenter = isCopycatCopiedRoleTurn && copiedCenterIndex === centerIndex;

    if (isCopycatCopiedCenter && !isDeselecting) {
      setMessage("Hãy chọn lá giữa khác lá Copy Cat đã copy.");
      return;
    }

    if (!isDeselecting && isSeerEffect && selectedSeerFoundWolf) {
      setMessage("Tiên Tri đã thấy Sói nên phải bấm OK để kết thúc lượt.");
      return;
    }

    if (effectiveNightActionRole === "witch") {
      if (isDeselecting && hasCenterReveal(centerIndex)) {
        setMessage("Lá giữa đã xem sẽ được giữ để Phù Thuỷ đổi với người nhận.");
        return;
      }

      if (!isDeselecting && currentTurnViewedCenterIndexes.length >= 1 && !hasCenterReveal(centerIndex)) {
        setMessage("Phù Thuỷ chỉ được xem một lá giữa bàn.");
        return;
      }

      setSelectedCenterIndexes(isDeselecting ? [] : [centerIndex]);

      if (!isDeselecting) {
        void revealCenterCard(centerIndex);
      }

      return;
    }

    if (
      effectiveNightActionRole === "seer" ||
      (myRole === "copycat" && copycatCopiedRole === "seer")
    ) {
      if (!isDeselecting && activeActionTargetIds.length > 0) {
        setMessage("Bạn đã chọn xem người chơi nên không thể xem thêm lá giữa.");
        return;
      }

      setSelectedPlayerIds((current) => (isActingAsDoppelganger ? current.slice(0, 1) : []));
    }

    const maxCenterSelections =
      isActingAsDoppelganger
        ? effectiveNightActionRole === "seer"
          ? 2
          : 1
        : myRole === "copycat"
        ? isCopycatCopyTurn
          ? 1
          : copycatCopiedRole === "seer"
            ? 2
            : 1
        : 2;

    if (
      !isDeselecting &&
      (effectiveNightActionRole === "seer" || myRole === "copycat" || myRole === "doppelganger") &&
      selectedCenterIndexes.length >= maxCenterSelections
    ) {
      setMessage("Bạn đã chọn đủ số lá giữa cho hành động này.");
      return;
    }

    if (
      !isDeselecting &&
      canRevealCenterImmediately &&
      !hasCenterReveal(centerIndex) &&
      currentTurnViewedCenterIndexes.length >= centerRevealLimit
    ) {
      setMessage(`Bạn chỉ được xem tối đa ${centerRevealLimit} lá giữa bàn trong lượt này.`);
      return;
    }

    setSelectedCenterIndexes((current) => {
      if (current.includes(centerIndex)) {
        if (hasCenterReveal(centerIndex)) {
          setMessage("Lá giữa đã xem sẽ được giữ trong lượt này.");
          return current;
        }

        return current.filter((index) => index !== centerIndex);
      }

      if (
        canRevealCenterImmediately &&
        !hasCenterReveal(centerIndex) &&
        currentTurnViewedCenterIndexes.length >= centerRevealLimit
      ) {
        setMessage(`Bạn chỉ được xem tối đa ${centerRevealLimit} lá giữa bàn trong lượt này.`);
        return current;
      }

      if (effectiveNightActionRole === "seer" || myRole === "copycat" || myRole === "doppelganger") {
        if (current.length >= maxCenterSelections) {
          setMessage("Bạn đã chọn đủ số lá giữa cho hành động này.");
          return current;
        }

        return [...current, centerIndex];
      }

      return [centerIndex];
    });

    if (!isDeselecting && canRevealCenterImmediately) {
      void revealCenterCard(centerIndex);
    }
  }

  function submitNightAction() {
    if (!myRole) {
      return;
    }

    if (!isMyNightTurn) {
      setMessage("Chưa tới lượt của bạn.");
      return;
    }

    setMessage("");
    setPendingLabel("Đang lưu hành động ban đêm...");
    startTransition(async () => {
      const submittedCenterIndexes =
        myRole === "copycat" &&
        activeNightTurn?.isCopycatCopiedRole &&
        playState.myAction?.targetCenterIndex != null
          ? [
              playState.myAction.targetCenterIndex,
              ...selectedCenterIndexes.filter((index) => index !== playState.myAction?.targetCenterIndex),
            ]
          : selectedCenterIndexes;
      const isSubmittingCopycatCopiedRole =
        myRole === "copycat" && Boolean(activeNightTurn?.isCopycatCopiedRole);
      const result = await submitWolfNightAction(playState.room.code, {
        actionType: myRole,
        targetPlayerId: selectedPlayerIds[0] ?? null,
        targetPlayerId2:
          isActingAsDoppelganger
            ? activeDoppelgangerActionTargetIds[0] ?? null
            : selectedPlayerIds[1] ?? null,
        targetPlayerId3:
          isActingAsDoppelganger
            ? activeDoppelgangerActionTargetIds[1] ?? null
            : null,
        targetCenterIndex:
          hasWerewolfTeammates && !isSubmittingCopycatCopiedRole
            ? null
            : submittedCenterIndexes[0] ?? null,
        targetCenterIndex2:
          hasWerewolfTeammates
            ? null
            : submittedCenterIndexes[1] ?? null,
        targetCenterIndex3:
          hasWerewolfTeammates
            ? null
            : submittedCenterIndexes[2] ?? null,
      });

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      setMessage("");
      setSelectedPlayerIds([]);
      setSelectedCenterIndexes([]);
      setRevealedCenterCards([]);
      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function confirmNightActionResult() {
    setMessage("");
    setPendingLabel("Đang xác nhận kết quả lượt đêm...");
    startTransition(async () => {
      const result = await confirmWolfNightActionResult(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function confirmCurrentPhase(label: string) {
    setMessage("");
    setPendingLabel(label);
    startTransition(async () => {
      const result = await submitWolfPhaseConfirmation(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function votePlayer(playerId: string | null) {
    setMessage("");
    setOptimisticVoteTargetPlayerId(playerId ?? VOTE_SKIP_KEY);
    setPendingLabel("Đang lưu phiếu bầu...");
    startTransition(async () => {
      const result = await submitWolfVote(playState.room.code, playerId);

      if (!result.ok) {
        setMessage(result.error);
        setOptimisticVoteTargetPlayerId(null);
        setPendingLabel("");
        return;
      }

      await refreshPlayState();
      setSelectedVoteTargetPlayerId(null);
      setOptimisticVoteTargetPlayerId(null);
      setPendingLabel("");
    });
  }

  function selectVoteTarget(playerId: string | null) {
    setMessage("");
    setSelectedVoteTargetPlayerId(playerId ?? VOTE_SKIP_KEY);
  }

  function returnToLobby() {
    setMessage("");
    setPendingLabel("Đang về phòng chờ...");
    startTransition(async () => {
      const result = await finishWolfGame(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      router.push(`/games/wolf/rooms/${playState.room.code}`);
    });
  }

  function requestResetGame() {
    if (!window.confirm("Reset game và đưa tất cả người chơi về phòng chờ? Mọi người sẽ phải bấm sẵn sàng lại từ đầu.")) {
      return;
    }

    returnToLobby();
  }

  function exitGame() {
    setMessage("");
    setPendingLabel("Đang thoát phòng...");
    startTransition(async () => {
      await leaveWolfRoom(playState.room.code);
      router.push("/games/wolf");
    });
  }

  function startPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setCoverPointerStartY(event.clientY);
    setCoverDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY === null) {
      return;
    }

    event.preventDefault();
    const nextOffset = Math.min(0, event.clientY - coverPointerStartY);
    const maxLift = event.currentTarget.offsetHeight;
    if (coverPointerStartY - event.clientY >= 44 && privateRevealKey) {
      setUnlockedPrivateRevealKey(privateRevealKey);
    }

    setCoverDragOffset(Math.max(nextOffset, -maxLift));
  }

  function endPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY !== null && coverPointerStartY - event.clientY >= 44) {
      setUnlockedPrivateRevealKey(privateRevealKey);
    }

    setCoverPointerStartY(null);
    setCoverDragOffset(0);
  }

  function renderPrivateCover() {
    return (
      <div
        aria-hidden={privateRevealUnlocked}
        className={`${styles.privateRevealCover} ${coverPointerStartY !== null ? styles.privateRevealCoverDragging : ""}`}
        style={{ transform: `translateY(${coverDragOffset}px)` }}
        onClick={() => {
          if (privateRevealKey) {
            setUnlockedPrivateRevealKey(privateRevealKey);
          }
        }}
        onPointerCancel={() => {
          setCoverPointerStartY(null);
          setCoverDragOffset(0);
        }}
        onPointerDown={startPrivateRevealGesture}
        onPointerMove={movePrivateRevealGesture}
        onPointerUp={endPrivateRevealGesture}
      >
        <Image
          alt=""
          aria-hidden="true"
          className={styles.privateRevealCoverImage}
          draggable={false}
          fill
          sizes="(max-width: 768px) 100vw, 30rem"
          src={PRIVATE_CARD_COVER_IMAGE_PATH}
        />
        <span className={styles.privateRevealHint}>Kéo lên để xem bài</span>
        <div aria-hidden="true" className={styles.privateRevealHandle}>
          <ArrowUp aria-hidden="true" />
        </div>
      </div>
    );
  }

  function renderKnownNightCards(options: { isNightResult?: boolean } = {}) {
    const revealedCenterCardsFromState = playState.centerCards.filter(
      (card) => card.role || typeof card.isWerewolf === "boolean"
    );
    const hasKnownCards = Boolean(
      playState.myCard?.nightReviewRole ||
        playState.playerReveals.length > 0 ||
        revealedCenterCardsFromState.length > 0
    );

    if (!hasKnownCards) {
      return null;
    }

    return (
      <div
        className={`${styles.playerRevealGrid} ${
          options.isNightResult ? styles.nightResultRevealGrid : ""
        }`}
      >
        {playState.myCard?.nightReviewRole && (
          <RoleCard
            label={myRole === "insomniac" ? "Bài hiện tại" : "Lá vừa lấy"}
            role={playState.myCard.nightReviewRole}
          />
        )}
        {playState.playerReveals.map((playerReveal) => (
          <RoleCard
            key={playerReveal.playerId}
            label={`Soi ${playerReveal.playerName}`}
            role={playerReveal.role}
          />
        ))}
        {revealedCenterCardsFromState.map((centerCard) =>
          centerCard.role ? (
            <RoleCard
              key={`center-${centerCard.index}`}
              label={`Lá giữa ${centerCard.index + 1}`}
              role={centerCard.role}
            />
          ) : (
            <article className={styles.playCard} key={`center-${centerCard.index}`}>
              <span>{`Lá giữa ${centerCard.index + 1}`}</span>
              <strong>{centerCard.isWerewolf ? "Sói" : "Không phải Sói"}</strong>
            </article>
          )
        )}
      </div>
    );
  }

  function renderNightActions() {
    if (!myRole) {
      return <p>Bạn chưa có bài trong ván này.</p>;
    }

    if (!isMyNightTurn) {
      return (
        <div className={styles.nightTurnWaiting}>
          <span>Lượt hiện tại</span>
          <strong>
            {activeNightTurn ? "Đến lượt bạn" : "Đang chờ lượt ban đêm"}
          </strong>
          <p>Người chơi đang hành động được giữ kín cho đến khi ván kết thúc.</p>
        </div>
      );
    }

    if (playState.isCurrentNightTurnActionSubmitted) {
      return (
        <>
          {renderKnownNightCards({ isNightResult: true })}
          {nightResultSummary && <p className={styles.nightResultSummaryLine}>{nightResultSummary}</p>}
          <div className={styles.nightTurnWaiting}>
            <span>Kết quả lượt</span>
            <strong>Hãy ghi nhớ thông tin của bạn</strong>
            {playState.nightReviewMessages.map((reviewMessage) => (
              <p key={reviewMessage}>{reviewMessage}</p>
            ))}
          </div>
        </>
      );
    }

    if (nightActionRole === "insomniac") {
      return (
        <>
          {renderKnownNightCards()}
          <div className={styles.nightTurnWaiting}>
            <span>Lượt Mất Ngủ</span>
            <strong>Đây là bài hiện tại của bạn</strong>
            <p>Ghi nhớ lá bài này rồi bấm OK để kết thúc lượt đêm.</p>
          </div>
        </>
      );
    }

    const isChoosingDoppelgangerTarget = nightActionRole === "doppelganger" && !activeDoppelgangerCopiedRole;
    const needsPlayerPicker =
      isChoosingDoppelgangerTarget ||
      effectiveNightActionRole === "werewolf_seer" ||
      effectiveNightActionRole === "robber" ||
      effectiveNightActionRole === "troublemaker" ||
      effectiveNightActionRole === "witch";
    const needsCenterPicker =
      effectiveNightActionRole === "seer" ||
      effectiveNightActionRole === "witch" ||
      effectiveNightActionRole === "drunk" ||
      (effectiveNightActionRole === "copycat" && !isDoppelgangerCopycatOnly) ||
      (effectiveNightActionRole === "werewolf" && !isActingAsDoppelganger && !hasWerewolfTeammates);
    const isPlayerPickerDisabled =
      isCenterRevealPending ||
      copiedSeerCenterPathStarted;
    const selectedPickerPlayerIds =
      isActingAsDoppelganger && activeDoppelgangerCopiedRole
        ? activeDoppelgangerActionTargetIds
        : selectedPlayerIds;
    const playerPickerLabel = isChoosingDoppelgangerTarget
      ? "Chọn người để nhân bản"
      : nightActionRole === "doppelganger" && activeDoppelgangerCopiedRole
        ? `Thực hiện ${WOLF_ROLE_LABELS[activeDoppelgangerCopiedRole]}`
        : "Chọn người chơi";
    return (
      <>
        {nightActionRole === "doppelganger" && activeDoppelgangerCopiedRole && (
          <div className={styles.playerRevealGrid}>
            <RoleCard
              label={`Nhân bản ${getPlayerName(playState.players, activeDoppelgangerCopiedPlayerId)}`}
              role={activeDoppelgangerCopiedRole}
            />
          </div>
        )}

        {shouldShowWerewolfTeammatePanel && (
          <div className={styles.werewolfTeammatePanel}>
            <span>Ma Sói cùng phe</span>
            <strong>{werewolfTeammateNames.length > 0 ? werewolfTeammateNames.join(", ") : "Không có"}</strong>
            <p>
              {myRole === "copycat" && copycatCopiedRole && WOLF_ROLE_TEAMS[copycatCopiedRole] === "werewolves"
                ? werewolfTeammateNames.length > 0
                  ? "Bạn đã copy phe Ma Sói từ lá giữa bàn."
                  : "Bạn đã copy Ma Sói và là Ma Sói một mình, được chọn 1 lá giữa bàn để xem."
                : "Vì có từ 2 Ma Sói trở lên, bạn không được xem lá giữa bàn."}
            </p>
          </div>
        )}

        {needsPlayerPicker && (
          <div className={`${styles.playPicker} ${styles.playerPicker}`}>
            <span>{playerPickerLabel}</span>
            {playerPickerOptions.map((player) => (
              <button
                className={selectedPickerPlayerIds.includes(player.id) ? styles.playOptionActive : styles.playOption}
                key={player.id}
                type="button"
                disabled={isPending || isPlayerPickerDisabled}
                onClick={() => togglePlayerSelection(player.id)}
              >
                <span className={styles.playerOptionText}>
                  {player.id === playState.currentPlayerId ? "Tôi" : player.name}
                </span>
                <span
                  aria-hidden="true"
                  className={`${styles.playerOptionIconWrap} ${
                    selectedPickerPlayerIds.includes(player.id) ? styles.playerOptionIconWrapVisible : ""
                  }`}
                >
                  {selectedPickerPlayerIds.includes(player.id) && <Check aria-hidden="true" />}
                </span>
              </button>
            ))}
          </div>
        )}

        {needsCenterPicker && (
          <div className={styles.playPicker}>
            <span>Chọn lá giữa bàn</span>
            {playState.centerCards.map((card) => {
              const isCenterLoading = revealingCenterIndexes.includes(card.index);
              const revealLabel =
                selectedCenterIndexes.includes(card.index) || card.role || typeof card.isWerewolf === "boolean"
                  ? getCenterRevealLabel(card.index)
                  : null;

              return (
                <button
                  className={selectedCenterIndexes.includes(card.index) ? styles.playOptionActive : styles.playOption}
                  key={card.index}
                  type="button"
                  disabled={isPending || isCenterRevealPending}
                  onClick={() => toggleCenterSelection(card.index)}
                >
                  {isCenterLoading && <LoaderCircle className={styles.playOptionSpinner} aria-hidden="true" />}
                  Lá {card.index + 1}
                  {isCenterLoading ? " - Đang mở..." : revealLabel ? ` - ${revealLabel}` : ""}
                </button>
              );
            })}
          </div>
        )}

      </>
    );
  }

  const selectedCenterRevealsLoaded =
    isActingAsDoppelganger
      ? Boolean(
          activeDoppelgangerCopiedRole &&
            (activeDoppelgangerCopiedRole === "seer"
              ? isSeerSelectionComplete(selectedCenterIndexes) && selectedCenterIndexes.every(hasCenterReveal)
              : activeDoppelgangerCopiedRole === "witch"
                ? selectedCenterIndexes.length === 1 && selectedCenterIndexes.every(hasCenterReveal)
                : true)
        )
      : myRole === "copycat"
      ? isCopycatCopyTurn
        ? selectedCenterIndexes.length === 1 &&
          selectedCenterIndexes[0] != null &&
          hasCenterReveal(selectedCenterIndexes[0])
        : copiedCenterIndex != null &&
          hasCenterReveal(copiedCenterIndex) &&
          (copycatCopiedRole === "seer"
            ? isSeerSelectionComplete(selectedCenterIndexes) && selectedCenterIndexes.every(hasCenterReveal)
            : copycatCopiedRole === "witch"
              ? selectedCenterIndexes.length === 1 && selectedCenterIndexes.every(hasCenterReveal)
              : copycatCopiedRole === "werewolf"
                ? selectedCenterIndexes.length === 0 || selectedCenterIndexes.every(hasCenterReveal)
              : true)
      : nightActionRole === "seer"
        ? viewedCenterIndexes.length > 0
          ? isSeerSelectionComplete(selectedCenterIndexes) && selectedCenterIndexes.every(hasCenterReveal)
          : selectedCenterIndexes.every(hasCenterReveal)
        : nightActionRole === "witch"
          ? selectedCenterIndexes.length === 1 && selectedCenterIndexes[0] != null && hasCenterReveal(selectedCenterIndexes[0])
          : nightActionRole === "werewolf"
            ? hasWerewolfTeammates ||
              selectedCenterIndexes.length === 0 ||
              (selectedCenterIndexes[0] != null && hasCenterReveal(selectedCenterIndexes[0]))
            : true;
  const canSubmitNightAction =
    (isActingAsDoppelganger &&
      Boolean(
        activeDoppelgangerCopiedRole &&
          (activeDoppelgangerCopiedRole === "villager" ||
            activeDoppelgangerCopiedRole === "insomniac" ||
            activeDoppelgangerCopiedRole === "werewolf" ||
            activeDoppelgangerCopiedRole === "doppelganger" ||
            activeDoppelgangerCopiedRole === "copycat" ||
            (activeDoppelgangerCopiedRole === "seer" &&
              isSeerSelectionComplete(selectedCenterIndexes)) ||
            (activeDoppelgangerCopiedRole === "werewolf_seer" && activeDoppelgangerActionTargetIds.length === 1) ||
            (activeDoppelgangerCopiedRole === "robber" && activeDoppelgangerActionTargetIds.length === 1) ||
            (activeDoppelgangerCopiedRole === "troublemaker" && activeDoppelgangerActionTargetIds.length === 2) ||
            (activeDoppelgangerCopiedRole === "witch" &&
              activeDoppelgangerActionTargetIds.length === 1 &&
              selectedCenterIndexes.length === 1) ||
            (activeDoppelgangerCopiedRole === "drunk" && selectedCenterIndexes.length === 1))
      )) ||
    nightActionRole === "villager" ||
    nightActionRole === "insomniac" ||
    (nightActionRole === "werewolf" && (hasWerewolfTeammates ? selectedCenterIndexes.length === 0 : selectedCenterIndexes.length <= 1)) ||
    (nightActionRole === "werewolf_seer" && selectedPlayerIds.length === 1) ||
    (nightActionRole === "robber" && selectedPlayerIds.length === 1) ||
    (nightActionRole === "troublemaker" && selectedPlayerIds.length === 2) ||
    (nightActionRole === "witch" && selectedPlayerIds.length === 1 && selectedCenterIndexes.length === 1) ||
    (nightActionRole === "drunk" && selectedCenterIndexes.length === 1) ||
    (nightActionRole === "seer" &&
      isSeerSelectionComplete(selectedCenterIndexes)) ||
    (isCopycatCopyTurn &&
      selectedCenterIndexes.length === 1) ||
    (myRole === "copycat" &&
      isCopycatCopiedRoleTurn &&
      (copycatCopiedRole === "villager" ||
        copycatCopiedRole === "insomniac" ||
        copycatCopiedRole === "werewolf" ||
        copycatCopiedRole === "copycat" ||
        (copycatCopiedRole === "seer" &&
          isSeerSelectionComplete(selectedCenterIndexes)) ||
        (copycatCopiedRole === "werewolf_seer" && selectedPlayerIds.length === 1) ||
        (copycatCopiedRole === "robber" && selectedPlayerIds.length === 1) ||
        (copycatCopiedRole === "troublemaker" && selectedPlayerIds.length === 2) ||
        (copycatCopiedRole === "witch" && selectedPlayerIds.length === 1 && selectedCenterIndexes.length === 1) ||
        (copycatCopiedRole === "drunk" && selectedCenterIndexes.length === 1)));
  const canSubmitResolvedNightAction =
    canSubmitNightAction && selectedCenterRevealsLoaded && !isCenterRevealPending;
  const hasNightReviewCards = Boolean(
    playState.myCard?.nightReviewRole ||
      playState.playerReveals.length > 0 ||
      playState.centerCards.some((card) => card.role || typeof card.isWerewolf === "boolean")
  );
  const nightActionButtonLabel = playState.isCurrentNightTurnActionSubmitted
    ? "OK, tôi đã biết kết quả"
    : nightActionRole === "insomniac"
      ? "OK, tôi đã biết bài hiện tại"
      : isSeerEffect && canSubmitResolvedNightAction
        ? "OK, tôi đã biết kết quả"
      : "Hoàn tất lượt đêm";
  const canShowNightReminder = Boolean(isDiscussionPhase && playState.nightReminder?.lines.length);
  const nightReminderKey = playState.nightReminder
    ? `${playState.game.id}:${playState.game.phase}:${playState.game.roundNumber}`
    : null;
  const isNightReminderOpen = Boolean(
    canShowNightReminder && nightReminderKey && openNightReminderKey === nightReminderKey
  );

  function renderNightReminderButton() {
    if (!canShowNightReminder) {
      return null;
    }

    return (
      <button
        aria-label="Xem lại hành động ban đêm của tôi"
        className={styles.nightReminderButton}
        title="Xem lại hành động ban đêm"
        type="button"
        onClick={() => setOpenNightReminderKey(nightReminderKey)}
      >
        <History aria-hidden="true" />
      </button>
    );
  }

  return (
    <main
      className={`${styles.page} ${styles.playPage} ${styles.classicWolfTheme} ${
        usesFocusedRevealLayout ? styles.focusedPlayPage : ""
      } ${isNightReviewPhase ? styles.nightReviewPage : ""} ${isCardRevealPhase ? styles.cardRevealPage : ""} ${
        hasFixedBottomActionBar ? styles.fixedBottomActionPage : ""
      } ${hasFixedBottomWaitingOnly ? styles.fixedBottomWaitingPage : ""}`}
    >
      <section
        className={`${styles.playHeader} ${isDiscussionPhase ? styles.discussionHeader : ""} ${
          isVotingPhase ? styles.votingHeader : ""
        } ${isResultPhase ? styles.resultHeader : ""}`}
      >
        <div>
          <span>Phòng {playState.room.code.toUpperCase()}</span>
          <h1>{WOLF_PHASE_LABELS[playState.game.phase]}</h1>
        </div>
        {playState.isCurrentPlayerHost && (
          <button
            aria-label="Reset game về phòng chờ"
            className={styles.resetGameButton}
            title="Reset game"
            type="button"
            disabled={isPending}
            onClick={requestResetGame}
          >
            <RotateCcw aria-hidden="true" />
          </button>
        )}
        {isCardRevealPhase && (
          <p>
            Hãy xem kĩ lá bài của bạn và ghi nhớ nó
          </p>
        )}
        {isNightPhase && (
          <p>
            {isMyNightTurn && nightActionRole
              ? WOLF_ROLE_DESCRIPTIONS[nightActionRole]
              : playState.isNightTurnInProgress
                ? "Đang chờ người chơi khác thực hiện lượt ban đêm."
                : "Tất cả lượt ban đêm đã hoàn tất."}
          </p>
        )}
        {isNightReviewPhase && (
          <p>
            Xem lại kết quả hành động ban đêm của bạn. Khi tất cả người chơi hoàn tất, ván sẽ tự chuyển sang thảo luận.
          </p>
        )}
        {isDiscussionPhase && (
          <p>Thảo luận, thuyết phục và tìm Ma Sói. Khi tất cả đã thảo luận xong, ván sẽ tự chuyển sang bỏ phiếu.</p>
        )}
        {isVotingPhase && <p>Chọn một người để bỏ phiếu treo.</p>}
      </section>

      {!isDiscussionPhase && (
        <section
          className={`${styles.playPanel} ${usesFocusedRevealLayout ? styles.focusedPlayPanel : ""} ${
            isNightPhase ? styles.classicWolfNightPanel : ""
          }`}
        >
        {!hasFocusedWaitingStatus && playState.game.phase !== "result" && (
          <div>
            <span>Điều khiển phase</span>
            <h2>{WOLF_PHASE_LABELS[playState.game.phase]}</h2>
          </div>
        )}

        {isCardRevealPhase && (
          <>
            <div className={styles.privateRevealBox}>
              <RoleCard
                isFocusedReveal
                label="Bài của tôi"
                role={playState.myCard?.originalRole ?? null}
              />
              {renderPrivateCover()}
            </div>
          </>
        )}

        {playState.game.phase === "night" && renderNightActions()}

        {playState.game.phase === "night_review" && (
          <>
            <div className={styles.privateRevealBox}>
              <div
                className={
                  hasNightReviewCards
                    ? styles.nightReviewRevealStack
                    : styles.nightReviewContent
                }
              >
                {renderKnownNightCards()}
                {playState.nightReviewMessages.map((reviewMessage) => (
                  <p
                    className={playState.myCard?.nightReviewRole ? styles.nightReviewMessage : undefined}
                    key={reviewMessage}
                  >
                    {reviewMessage}
                  </p>
                ))}
              </div>
              {renderPrivateCover()}
            </div>
          </>
        )}

        {playState.game.phase === "voting" && (
          <div className={styles.votingPanel}>
            <div className={styles.votingTitle}>
              <strong>Lựa chọn bỏ phiếu</strong>
              <span>Chọn 1 phương án bên dưới</span>
            </div>
            <div className={styles.votingOptions}>
              <button
                className={`${styles.votingOption} ${
                  activeVoteTargetPlayerId === VOTE_SKIP_KEY ? styles.votingOptionActive : ""
                }`}
                type="button"
                disabled={isPending || !currentPlayer || currentPlayer.hasVoted}
                onClick={() => selectVoteTarget(null)}
              >
                <span className={styles.votingOptionAvatar}>
                  <X aria-hidden="true" />
                </span>
                <span>Bỏ qua</span>
                <span className={styles.votingOptionCheck}>
                  {activeVoteTargetPlayerId === VOTE_SKIP_KEY && <Check aria-hidden="true" />}
                </span>
              </button>
              {playState.players.map((player) => {
                const voters = votersByTarget.get(player.id) ?? [];
                const voterNames = voters.map((voter) => voter.name).join(", ");

                return (
                  <button
                    className={`${styles.votingOption} ${
                      activeVoteTargetPlayerId === player.id ? styles.votingOptionActive : ""
                    }`}
                    key={player.id}
                    type="button"
                    disabled={isPending || !currentPlayer || currentPlayer.hasVoted}
                    onClick={() => selectVoteTarget(player.id)}
                  >
                    <Image
                      alt=""
                      className={styles.votingOptionAvatar}
                      height={36}
                      src={getPlayerAvatarSrc(player.avatarKey, player.avatarUrl)}
                      width={36}
                    />
                    <span>{player.name}</span>
                    <span className={styles.votingOptionCheck}>
                      {voters.length > 5 ? (
                        <span
                          className={styles.votingOptionVoterCount}
                          aria-label={`${voterNames} (${voters.length} phiếu)`}
                          title={voterNames}
                        >
                          {voters.length}
                        </span>
                      ) : voters.length > 0 ? (
                        <span
                          className={styles.votingOptionVoters}
                          aria-label={`${voterNames} (${voters.length} phiếu)`}
                          title={voterNames}
                        >
                          <span className={styles.votingOptionVoterNames}>{voterNames}</span>
                        </span>
                      ) : activeVoteTargetPlayerId === player.id ? (
                        <Check aria-hidden="true" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              className={styles.votingConfirmButton}
              type="button"
              disabled={!canConfirmVote}
              onClick={() => votePlayer(activeVoteTargetPlayerId === VOTE_SKIP_KEY ? null : activeVoteTargetPlayerId)}
            >
              <Check aria-hidden="true" />
              {currentPlayer?.hasVoted ? "Đã gửi phiếu" : "Xác nhận lựa chọn"}
            </button>
            <p className={styles.votingHint}>Bạn chỉ có thể chọn một lần trong lượt này.</p>
            <div className={styles.votingStatsGrid}>
              <div className={styles.votingStatCard}>
                <Check aria-hidden="true" />
                <span>Đã gửi phiếu</span>
                <strong>
                  {submittedVotesCount}/{playState.players.length}
                </strong>
              </div>
              <div className={styles.votingStatCard}>
                <X aria-hidden="true" />
                <span>Bỏ qua</span>
                <strong>{skippedVotesCount}</strong>
              </div>
              <div className={styles.votingStatCard}>
                <Users aria-hidden="true" />
                <span>Còn chờ</span>
                <strong>{pendingVotesCount}</strong>
              </div>
            </div>
          </div>
        )}

        {playState.game.phase === "result" && playState.result && (
          <>
            <strong
              className={`${styles.resultBanner} ${
                isCurrentPlayerWinner === false ? styles.resultBannerDanger : ""
              }`}
            >
              {playState.result.winnerText}
            </strong>
            <div className={styles.playPicker}>
              {playState.result.skippedVoteCount > 0 && (
                <span className={styles.voteResult}>
                  Bỏ qua: {playState.result.skippedVoteCount} lượt
                </span>
              )}
              {playState.result.voteCounts.map((voteCount) => (
                <span
                  className={`${styles.voteResult} ${
                    maxVoteCount > 0 && voteCount.votes === maxVoteCount ? styles.voteResultTop : ""
                  }`}
                  key={voteCount.playerId}
                >
                  {getResultPlayerName(playState.players, playState.allPlayersSummary, voteCount.playerId)}: {voteCount.votes} phiếu
                </span>
              ))}
            </div>
          </>
        )}

        {message && <p className={styles.inlineError}>{message}</p>}

        </section>
      )}

      {isDiscussionPhase && roleDeckSummary.length > 0 && (
        <section className={`${styles.discussionRoleDeck} ${styles.discussionPanel}`}>
          <div className={styles.discussionSectionTitle}>
            <span>Vai trò trong ván</span>
            {renderNightReminderButton()}
          </div>
          <div className={`${styles.roleDeckGrid} ${styles.discussionRoleGrid}`}>
            {roleDeckSummary.map((roleSummary) => (
              <article
                key={roleSummary.role}
                className={`${styles.roleDeckTile} ${styles.discussionRoleTile} ${
                  roleSummary.role === "werewolf" || roleSummary.role === "werewolf_seer"
                    ? styles.roleDeckTileWolf
                    : ""
                }`}
              >
                <button
                  aria-label={`Xem hướng dẫn ${WOLF_ROLE_LABELS[roleSummary.role]}`}
                  className={styles.roleDeckInfoButton}
                  type="button"
                  onClick={() => setSelectedRoleGuide(roleSummary.role)}
                >
                  <CircleAlert aria-hidden="true" />
                </button>
                <strong>{WOLF_ROLE_LABELS[roleSummary.role]}</strong>
                <span>{roleSummary.count} lá</span>
              </article>
            ))}
          </div>
          <p className={styles.discussionHint}>Mục tiêu: thảo luận và tìm ra người đáng nghi nhất.</p>
        </section>
      )}

      {isCardRevealPhase && (
        <section className={`${styles.cardRevealActionBar} ${styles.cardRevealInlineActionBar}`}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || playState.isCurrentPlayerPhaseReady || !privateRevealUnlocked}
            onClick={() => confirmCurrentPhase("Đang xác nhận đã xem bài...")}
          >
            <Check aria-hidden="true" />
            {playState.isCurrentPlayerPhaseReady ? "Đã OK" : "OK, tôi đã xem bài"}
          </button>
        </section>
      )}

      {isNightPhase && isMyNightTurn && myRole && (
        <section className={`${styles.cardRevealActionBar} ${styles.classicWolfNightActionBar}`}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={
              playState.isCurrentNightTurnActionSubmitted
                ? isPending
                : !canSubmitResolvedNightAction || isPending
            }
            onClick={playState.isCurrentNightTurnActionSubmitted ? confirmNightActionResult : submitNightAction}
          >
            <Check aria-hidden="true" />
            {nightActionButtonLabel}
          </button>
        </section>
      )}

      {isNightReviewPhase && (
        <section className={styles.cardRevealActionBar}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || playState.isCurrentPlayerPhaseReady || !privateRevealUnlocked}
            onClick={() => confirmCurrentPhase("Đang xác nhận đã xem lại...")}
          >
            <Check aria-hidden="true" />
            {playState.isCurrentPlayerPhaseReady ? "Đã xong" : "Xong, vào thảo luận"}
          </button>
        </section>
      )}

      {isDiscussionPhase && (
        <section className={`${styles.cardRevealActionBar} ${styles.classicWolfDiscussionActionBar}`}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || playState.isCurrentPlayerPhaseReady}
            onClick={() => confirmCurrentPhase("Đang xác nhận thảo luận xong...")}
          >
            <Check aria-hidden="true" />
            {playState.isCurrentPlayerPhaseReady ? "Đã sẵn sàng vote" : "Tôi đã thảo luận xong"}
          </button>
        </section>
      )}

      <section
        className={`${styles.playWaitingStatus} ${
          isCardRevealPhase ? styles.cardRevealWaitingStatus : hasFocusedWaitingStatus ? styles.focusedWaitingStatus : ""
        } ${isNightPhase ? styles.classicWolfNightStatus : ""} ${
          playState.game.phase === "result" ? styles.playWaitingStatusResult : ""
        }`}
        aria-live="polite"
      >
        {playState.game.phase === "result" && playState.allPlayersSummary ? (
          <div className={styles.resultSummaryStack}>
            {playState.cardMovementSummary && (
              <section className={styles.resultMovementCard}>
                {playState.cardMovementSummary.steps.length > 0 ? (
                  <ol className={styles.resultMovementList}>
                    {playState.cardMovementSummary.steps.map((step, index) => (
                      <li className={styles.resultMovementStep} key={step.id}>
                        <strong>{index + 1}. {step.logText}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.resultMovementEmpty}>Không có role nào thực hiện hành động trong đêm này.</p>
                )}
              </section>
            )}

            <div className={styles.resultSummaryList}>
              {playState.allPlayersSummary.map((summary) => (
                <div className={styles.resultSummaryRow} key={summary.playerId}>
                  <div className={styles.resultSummaryHeader}>
                    <strong>{summary.playerName}</strong>
                    {summary.finalRole !== summary.originalRole && (
                      <span className={styles.resultRoleTag}>Bị đổi bài</span>
                    )}
                  </div>
                  <div className={styles.resultRoleChange}>
                    <span>
                      Bài ban đầu
                      <strong>{WOLF_ROLE_LABELS[summary.originalRole]}</strong>
                    </span>
                    <ArrowRight className={styles.resultRoleArrow} aria-hidden="true" />
                    <span>
                      Bài hiện tại
                      <strong>{WOLF_ROLE_LABELS[summary.finalRole]}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span>{getWaitingStatusText()}</span>
        )}
      </section>

      {isResultPhase && (
        <section className={styles.resultActionBar}>
          {playState.isCurrentPlayerHost && (
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending}
              onClick={returnToLobby}
            >
              <Check aria-hidden="true" />
              Quay lại phòng chờ
            </button>
          )}
          <button className={styles.exitButton} type="button" disabled={isPending} onClick={exitGame}>
            <LogOut aria-hidden="true" />
            Thoát
          </button>
        </section>
      )}

      {isPending && (
        <div className={styles.playLoading} aria-live="polite">
          <LoaderCircle aria-hidden="true" />
          <span>{pendingLabel || "Đang xử lý..."}</span>
        </div>
      )}

      {isNightReminderOpen && playState.nightReminder && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="wolf-night-reminder-title"
            aria-modal="true"
            className={`${styles.modal} ${styles.nightReminderModal}`}
            role="dialog"
          >
            <button
              aria-label="Đóng nhắc lại hành động đêm"
              className={styles.closeButton}
              type="button"
              onClick={() => setOpenNightReminderKey(null)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="wolf-night-reminder-title">Hành động đêm trước</h2>
            <div className={styles.nightReminderSummary}>
              <span>{playState.nightReminder.title}</span>
              <ul className={styles.nightReminderList}>
                {playState.nightReminder.lines.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      {selectedRoleGuide && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="wolf-role-guide-title"
            aria-modal="true"
            className={`${styles.modal} ${styles.roleGuideModal}`}
            role="dialog"
          >
            <button
              aria-label="Đóng hướng dẫn vai trò"
              className={styles.closeButton}
              type="button"
              onClick={() => setSelectedRoleGuide(null)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="wolf-role-guide-title">{WOLF_ROLE_LABELS[selectedRoleGuide]}</h2>
            <div className={styles.roleGuideSection}>
              <span>Ban đêm</span>
              <p>{WOLF_ROLE_DESCRIPTIONS[selectedRoleGuide]}</p>
            </div>
            <div className={styles.roleGuideSection}>
              <span>Điều kiện thắng</span>
              <p>{WOLF_ROLE_WIN_CONDITIONS[selectedRoleGuide]}</p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
