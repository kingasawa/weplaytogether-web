"use client";

import {
  ArrowUp,
  BadgeCheck,
  Check,
  CircleAlert,
  Eye,
  FlaskConical,
  History,
  LoaderCircle,
  LogOut,
  Moon,
  RotateCcw,
  Shield,
  Skull,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent } from "react";
import { getPlayerAvatarSrc } from "@/lib/player-avatars";
import {
  CLASSIC_WOLF_ROLE_DESCRIPTIONS,
  CLASSIC_WOLF_ROLE_LABELS,
  type ClassicWolfRole,
} from "@/lib/classic-wolf-game";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import {
  advanceClassicWolfNightAutoPassIfReady,
  finishClassicWolfGame,
  getClassicWolfPlayState,
  leaveClassicWolfRoom,
  selectClassicWolfNightTarget,
  selectClassicWolfVoteTarget,
  submitClassicWolfNightAction,
  submitClassicWolfPhaseConfirmation,
  submitClassicWolfVote,
  type ClassicWolfPlayPlayer,
  type ClassicWolfPlayState,
} from "../../../actions";
import styles from "../../../../wolf/page.module.css";

const PHASE_LABELS: Record<ClassicWolfPlayState["game"]["phase"], string> = {
  card_reveal: "Xem vai",
  night: "Ban đêm",
  night_review: "Thông báo",
  discussion: "Thảo luận",
  voting: "Bỏ phiếu",
  result: "Kết quả",
};

const VOTE_SKIP_KEY = "__skip_vote__";
const PRIVATE_CARD_COVER_IMAGE_PATH = "/images/ui/mask_card.png";
const CLASSIC_WOLF_ROLE_CARD_IMAGES: Partial<Record<ClassicWolfRole, { alt: string; src: string }>> = {
  villager: { alt: "Lá bài Dân Làng", src: "/images/boards/cards/wolf/human.png" },
  werewolf: { alt: "Lá bài Ma Sói", src: "/images/boards/cards/wolf/wolf.png" },
  seer: { alt: "Lá bài Tiên Tri", src: "/images/boards/cards/wolf/seer.png" },
  witch: { alt: "Lá bài Phù Thủy", src: "/images/boards/cards/wolf/witch.png" },
  guard: { alt: "Lá bài Bảo Vệ", src: "/images/boards/cards/wolf/guard.png" },
  hunter: { alt: "Lá bài Thợ Săn", src: "/images/boards/cards/wolf/hunter.png" },
};

type WitchDecision = "rescue_prompt" | "rescue" | "poison_prompt" | "poison" | "skip";
type NightPickerIntent = "guard" | "wolf" | "seer" | "hunter" | "witchHeal" | "witchPoison" | "default";

function getPlayerName(players: ClassicWolfPlayPlayer[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "Không rõ";
}

function getRoleTeam(role: ClassicWolfRole | null) {
  return role === "werewolf" ? "werewolves" : role ? "villagers" : null;
}

function getResultRoleClassName(role: ClassicWolfRole | null) {
  if (!role) {
    return styles.resultRoleTag;
  }

  return `${styles.resultRoleTag} ${styles[`resultRoleTag${role[0].toUpperCase()}${role.slice(1)}`]}`;
}

function getNightHistoryRoleLabel(role: ClassicWolfPlayState["nightHistory"][number]["actionDescriptions"][number]["role"]) {
  if (role === "result") {
    return "Kết quả";
  }

  if (role === "vote") {
    return "Bỏ phiếu";
  }

  return CLASSIC_WOLF_ROLE_LABELS[role];
}

function getNightHistoryRoleClassName(role: ClassicWolfPlayState["nightHistory"][number]["actionDescriptions"][number]["role"]) {
  return `${styles.nightHistoryRole} ${styles[`nightHistoryRole${role[0].toUpperCase()}${role.slice(1)}`]}`;
}

function formatWaitingPlayers(
  players: Array<{ name: string }>,
  options: {
    countLabel: string;
    prefix?: string;
    suffix?: string;
  }
) {
  const prefix = options.prefix ?? "Đang chờ ";
  const suffix = options.suffix ?? "";
  const names = players.map((player) => player.name).join(", ");
  const textWithNames = `${prefix}${names}${suffix}`;

  return textWithNames.length <= 54 ? textWithNames : `${prefix}${players.length} ${options.countLabel}${suffix}`;
}

function RoleCard({ role }: { role: ClassicWolfRole | null }) {
  const roleCardImage = role ? CLASSIC_WOLF_ROLE_CARD_IMAGES[role] : null;

  return (
    <article
      aria-label={role ? CLASSIC_WOLF_ROLE_LABELS[role] : "Vai chưa xác định"}
      className={`${styles.playCard} ${styles.cardRevealRoleCard} ${roleCardImage ? styles.roleImageCard : ""}`}
    >
      {roleCardImage && (
        <Image
          alt={roleCardImage.alt}
          className={styles.roleCardImage}
          height={1565}
          priority
          sizes="(max-width: 768px) 50vw, 14rem"
          src={roleCardImage.src}
          width={1005}
        />
      )}
    </article>
  );
}

function getNightPickerActiveClassName(intent: NightPickerIntent) {
  if (intent === "guard") {
    return styles.playOptionActiveGuard;
  }

  if (intent === "wolf" || intent === "hunter" || intent === "witchPoison") {
    return styles.playOptionActiveDanger;
  }

  if (intent === "witchHeal") {
    return styles.playOptionActiveHeal;
  }

  if (intent === "seer") {
    return styles.playOptionActiveSeer;
  }

  return "";
}

function getNightPickerIconWrapClassName(intent: NightPickerIntent) {
  if (intent === "guard") {
    return styles.playerOptionIconWrapGuard;
  }

  return "";
}

function getNightPickerIntentForRole(role: ClassicWolfRole): NightPickerIntent {
  if (role === "guard") {
    return "guard";
  }

  if (role === "werewolf") {
    return "wolf";
  }

  if (role === "seer") {
    return "seer";
  }

  if (role === "hunter") {
    return "hunter";
  }

  return "default";
}

function renderNightPickerIcon(intent: NightPickerIntent) {
  if (intent === "guard") {
    return <Shield aria-hidden="true" />;
  }

  if (intent === "wolf") {
    return <Skull aria-hidden="true" />;
  }

  if (intent === "witchHeal" || intent === "witchPoison") {
    return <FlaskConical aria-hidden="true" />;
  }

  if (intent === "seer") {
    return <Eye aria-hidden="true" />;
  }

  if (intent === "hunter") {
    return <BadgeCheck aria-hidden="true" />;
  }

  return null;
}

function renderDiscussionRoleIcon(role: ClassicWolfRole) {
  if (role === "guard") {
    return <Shield aria-hidden="true" />;
  }

  if (role === "seer") {
    return <Eye aria-hidden="true" />;
  }

  if (role === "werewolf") {
    return <Skull aria-hidden="true" />;
  }

  if (role === "witch") {
    return <FlaskConical aria-hidden="true" />;
  }

  if (role === "hunter") {
    return <BadgeCheck aria-hidden="true" />;
  }

  return <Users aria-hidden="true" />;
}

export default function ClassicWolfPlayScreen({ initialState }: { initialState: ClassicWolfPlayState }) {
  const router = useRouter();
  const [playState, setPlayState] = useState(initialState);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [optimisticWolfTargetPlayerId, setOptimisticWolfTargetPlayerId] = useState<string | null | undefined>(undefined);
  const [witchDecision, setWitchDecision] = useState<WitchDecision>("rescue_prompt");
  const [revealedRoleGameId, setRevealedRoleGameId] = useState<string | null>(null);
  const [coverPointerStartY, setCoverPointerStartY] = useState<number | null>(null);
  const [coverDragOffset, setCoverDragOffset] = useState(0);
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [optimisticVoteTargetPlayerId, setOptimisticVoteTargetPlayerId] = useState<string | null>(null);
  const [selectedVoteTargetPlayerId, setSelectedVoteTargetPlayerId] = useState<string | null>(null);
  const [selectedRoleGuide, setSelectedRoleGuide] = useState<ClassicWolfRole | null>(null);
  const [openNightReminderKey, setOpenNightReminderKey] = useState<string | null>(null);
  const autoPassNightTurnInFlightRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  const currentPlayer = playState.players.find((player) => player.id === playState.currentPlayerId) ?? null;
  const myRole = playState.myRole;
  const isAlive = Boolean(currentPlayer?.isAlive);
  const activeNightTurn = playState.activeNightTurn;
  const isMyNightTurn = Boolean(
    playState.game.phase === "night" &&
      activeNightTurn &&
      playState.currentPlayerId &&
      activeNightTurn.playerIds.includes(playState.currentPlayerId)
  );
  const alivePlayers = playState.players.filter((player) => player.isAlive);
  const otherAlivePlayers = alivePlayers.filter((player) => player.id !== playState.currentPlayerId);
  const wolfPackPlayerIds = new Set(playState.wolfPack.map((member) => member.id));
  const werewolfTargetOptions = otherAlivePlayers.filter((player) => !wolfPackPlayerIds.has(player.id));
  const currentWolfPackMember = playState.wolfPack.find((member) => member.id === playState.currentPlayerId) ?? null;
  const activeWolfTargetPlayerId =
    myRole === "werewolf"
      ? optimisticWolfTargetPlayerId !== undefined
        ? optimisticWolfTargetPlayerId
        : currentWolfPackMember?.selectedTargetPlayerId ?? null
      : null;
  const wolfVotesByTarget = new Map<string, ClassicWolfPlayState["wolfPack"]>();

  for (const member of playState.wolfPack.filter((wolf) => wolf.isAlive)) {
    const selectedTargetPlayerId =
      member.id === playState.currentPlayerId && optimisticWolfTargetPlayerId !== undefined
        ? optimisticWolfTargetPlayerId
        : member.selectedTargetPlayerId;

    if (!selectedTargetPlayerId) {
      continue;
    }

    const voters = wolfVotesByTarget.get(selectedTargetPlayerId) ?? [];

    if (!voters.some((voter) => voter.id === member.id)) {
      wolfVotesByTarget.set(selectedTargetPlayerId, [...voters, member]);
    }
  }
  const guardTargetOptions = alivePlayers;
  const availableGuardTargetCount = guardTargetOptions.filter(
    (player) => player.id !== playState.previousGuardTargetPlayerId
  ).length;
  const hasValidGuardSelection = Boolean(
    selectedPlayerId && selectedPlayerId !== playState.previousGuardTargetPlayerId
  );
  const activeVoteTargetPlayerId =
    optimisticVoteTargetPlayerId ??
    selectedVoteTargetPlayerId ??
    (!currentPlayer?.hasVoted && currentPlayer?.hasVoteSelection
      ? currentPlayer.voteSelectionTargetPlayerId ?? VOTE_SKIP_KEY
      : null) ??
    (currentPlayer?.hasVoted && currentPlayer.voteTargetPlayerId === null
      ? VOTE_SKIP_KEY
      : currentPlayer?.voteTargetPlayerId ?? null);
  const isCardRevealPhase = playState.game.phase === "card_reveal";
  const isPrivateRoleRevealed = isCardRevealPhase && revealedRoleGameId === playState.game.id;
  const isNightPhase = playState.game.phase === "night";
  const isNightReviewPhase = playState.game.phase === "night_review";
  const isDiscussionPhase = playState.game.phase === "discussion";
  const isVotingPhase = playState.game.phase === "voting";
  const isResultPhase = playState.game.phase === "result";
  const isSeerRevealPending = Boolean(
    isNightPhase &&
      isMyNightTurn &&
      myRole === "seer" &&
      playState.myNightAction &&
      playState.seerReveal &&
      !currentPlayer?.isPhaseReady
  );
  const isVillagerNightDecoyTurn = Boolean(
    isNightPhase && isMyNightTurn && myRole === "villager" && activeNightTurn?.role === "villager"
  );
  const reviewEvent = playState.pendingDeathEvent;
  const isDayReviewPhase = isNightReviewPhase && reviewEvent?.phase === "day";
  const reviewNightDeathPlayerIds =
    isDayReviewPhase && reviewEvent
      ? Array.from(
          new Set(
            playState.deathEvents
              .filter((deathEvent) => deathEvent.phase === "night" && deathEvent.roundNumber === reviewEvent.roundNumber)
              .flatMap((deathEvent) => deathEvent.playerIds)
          )
        )
      : [];
  const reviewDayDeathPlayerIds = isDayReviewPhase && reviewEvent ? reviewEvent.playerIds : [];
  const reviewDayDeathPlayerIdSet = new Set(reviewDayDeathPlayerIds);
  const confirmedVotePlayers = isDayReviewPhase
    ? playState.players.filter((player) => player.hasVoted)
    : [];
  const voteReviewTargetIds = new Set<string>();

  for (const player of playState.players) {
    const receivedVote = confirmedVotePlayers.some((voter) => voter.voteTargetPlayerId === player.id);

    if (player.isAlive || reviewDayDeathPlayerIdSet.has(player.id) || receivedVote) {
      voteReviewTargetIds.add(player.id);
    }
  }

  for (const voter of confirmedVotePlayers) {
    if (voter.voteTargetPlayerId) {
      voteReviewTargetIds.add(voter.voteTargetPlayerId);
    }
  }

  const voteReviewRows = Array.from(voteReviewTargetIds).map((playerId) => ({
    id: playerId,
    targetName: getPlayerName(playState.players, playerId),
    voterNames: confirmedVotePlayers
      .filter((voter) => voter.voteTargetPlayerId === playerId)
      .map((voter) => voter.name),
    isEliminated: reviewDayDeathPlayerIdSet.has(playerId),
  }));
  const skippedVoteReviewVoters = confirmedVotePlayers.filter((player) => player.voteTargetPlayerId === null);
  const currentPhaseLabel = isDayReviewPhase
    ? "Kết quả bỏ phiếu"
    : isNightReviewPhase
      ? "Thông báo ban đêm"
      : PHASE_LABELS[playState.game.phase];
  const roleDeckSummary = useMemo(
    () =>
      playState.roleDeck.reduce<Array<{ role: ClassicWolfRole; count: number }>>((summary, role) => {
        const existing = summary.find((item) => item.role === role);

        if (existing) {
          existing.count += 1;
          return summary;
        }

        return [...summary, { role, count: 1 }];
      }, []),
    [playState.roleDeck]
  );
  const currentPlayerTeam = getRoleTeam(myRole);
  const isCurrentPlayerWinner =
    playState.result && currentPlayerTeam ? playState.result.winnerTeam === currentPlayerTeam : null;

  const refreshPlayState = useCallback(async () => {
    const nextState = await getClassicWolfPlayState(playState.room.code);

    if (!nextState) {
      router.push(`/games/wolf-classic/rooms/${playState.room.code}`);
      return;
    }

    setPlayState(nextState);
    setOptimisticWolfTargetPlayerId((current) => {
      if (current === undefined) {
        return current;
      }

      if (nextState.game.phase !== "night" || nextState.myRole !== "werewolf") {
        return undefined;
      }

      const nextCurrentWolf = nextState.wolfPack.find((member) => member.id === nextState.currentPlayerId) ?? null;

      return (nextCurrentWolf?.selectedTargetPlayerId ?? null) === current ? undefined : current;
    });
    setSelectedPlayerId((current) =>
      current && nextState.players.some((player) => player.id === current && player.isAlive) ? current : null
    );
    setSelectedVoteTargetPlayerId((current) => {
      if (nextState.game.phase !== "voting") {
        return null;
      }

      const nextCurrentPlayer = nextState.players.find((player) => player.id === nextState.currentPlayerId);

      if (nextCurrentPlayer?.hasVoted) {
        return nextCurrentPlayer.voteTargetPlayerId ?? VOTE_SKIP_KEY;
      }

      if (nextCurrentPlayer?.hasVoteSelection) {
        return nextCurrentPlayer.voteSelectionTargetPlayerId ?? VOTE_SKIP_KEY;
      }

      if (current === VOTE_SKIP_KEY) {
        return current;
      }

      return current && nextState.players.some((player) => player.id === current && player.isAlive) ? current : null;
    });
    setWitchDecision((current) => (nextState.game.phase === "night" ? current : "rescue_prompt"));
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

  useEffect(() => {
    if (!isNightPhase || !playState.currentPlayerId || !playState.activeNightTurn?.isAutoPass) {
      return;
    }

    const advanceAutoPassTurn = async () => {
      if (autoPassNightTurnInFlightRef.current) {
        return;
      }

      autoPassNightTurnInFlightRef.current = true;
      try {
        const result = await advanceClassicWolfNightAutoPassIfReady(playState.room.code);

        if (result.ok) {
          await refreshPlayState();
        }
      } finally {
        autoPassNightTurnInFlightRef.current = false;
      }
    };

    void advanceAutoPassTurn();
    const intervalId = window.setInterval(() => {
      void advanceAutoPassTurn();
    }, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    isNightPhase,
    playState.activeNightTurn?.isAutoPass,
    playState.currentPlayerId,
    playState.room.code,
    refreshPlayState,
  ]);

  function getWaitingStatusText() {
    if (isResultPhase) {
      return "Ván đã có kết quả.";
    }

    if (isNightPhase) {
      if (activeNightTurn) {
        if (isSeerRevealPending) {
          return "Hãy xem kết quả soi rồi bấm OK để tiếp tục.";
        }

        if (isVillagerNightDecoyTurn) {
          return "Hãy xác nhận lượt ban đêm của bạn.";
        }

        return isMyNightTurn
          ? "Đến lượt bạn thực hiện chức năng."
          : "Đêm đang diễn ra.";
      }

      return "Đêm đang diễn ra.";
    }

    if (isNightReviewPhase) {
      const waitingPlayers = alivePlayers.filter((player) => !player.isPhaseReady);
      return waitingPlayers.length > 0
        ? formatWaitingPlayers(waitingPlayers, {
            countLabel: "người",
            suffix: ` xác nhận ${isDayReviewPhase ? "kết quả" : "thông báo"}`,
          })
        : `Tất cả người sống đã xác nhận ${isDayReviewPhase ? "kết quả" : "thông báo"}.`;
    }

    if (isVotingPhase) {
      const waitingPlayers = alivePlayers.filter((player) => !player.hasVoted);
      return waitingPlayers.length > 0
        ? formatWaitingPlayers(waitingPlayers, {
            countLabel: "phiếu",
            prefix: "Đang chờ phiếu của ",
          })
        : "Đã đủ phiếu.";
    }

    const waitingPlayers = alivePlayers.filter((player) => !player.isPhaseReady);

    return waitingPlayers.length > 0
      ? formatWaitingPlayers(waitingPlayers, { countLabel: "người" })
      : "Tất cả người sống đã hoàn tất.";
  }

  function confirmCurrentPhase(label: string) {
    setMessage("");
    setPendingLabel(label);
    startTransition(async () => {
      const result = await submitClassicWolfPhaseConfirmation(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      setSelectedPlayerId(null);
      setWitchDecision("rescue_prompt");
      await refreshPlayState();
      setSelectedPlayerId(null);
      setPendingLabel("");
    });
  }

  function submitNightAction() {
    if (!myRole) {
      return;
    }

    setMessage("");
    setPendingLabel("Đang lưu hành động ban đêm...");
    startTransition(async () => {
      const nightTargetPlayerId = myRole === "werewolf" ? activeWolfTargetPlayerId : selectedPlayerId;
      const result = await submitClassicWolfNightAction(playState.room.code, {
        actionType: myRole,
        targetPlayerId: myRole === "witch" && witchDecision !== "poison" ? null : nightTargetPlayerId,
        useHeal: myRole === "witch" && witchDecision === "rescue",
      });

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      setSelectedPlayerId(null);
      setOptimisticWolfTargetPlayerId(undefined);
      setWitchDecision("rescue_prompt");
      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function selectWolfNightTarget(playerId: string | null) {
    if (myRole !== "werewolf") {
      return;
    }

    setMessage("");
    setSelectedPlayerId(playerId);
    setOptimisticWolfTargetPlayerId(playerId);
    void (async () => {
      const result = await selectClassicWolfNightTarget(playState.room.code, playerId);

      if (!result.ok) {
        setMessage(result.error);
        setOptimisticWolfTargetPlayerId(undefined);
        await refreshPlayState();
      }
    })();
  }

  function votePlayer(playerId: string | null) {
    setMessage("");
    setOptimisticVoteTargetPlayerId(playerId ?? VOTE_SKIP_KEY);
    setPendingLabel("Đang lưu phiếu bầu...");
    startTransition(async () => {
      const result = await submitClassicWolfVote(playState.room.code, playerId);

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

    void (async () => {
      const result = await selectClassicWolfVoteTarget(playState.room.code, playerId);

      if (!result.ok) {
        setMessage(result.error);
        await refreshPlayState();
      }
    })();
  }

  function returnToLobby() {
    setMessage("");
    setPendingLabel("Đang về phòng chờ...");
    startTransition(async () => {
      const result = await finishClassicWolfGame(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      router.push(`/games/wolf-classic/rooms/${playState.room.code}`);
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
      await leaveClassicWolfRoom(playState.room.code);
      router.push("/games/wolf-classic");
    });
  }

  function renderPlayerPicker(
    options: ClassicWolfPlayPlayer[],
    onSelect: (playerId: string | null) => void,
    intent: NightPickerIntent = "default",
    isOptionDisabled: (player: ClassicWolfPlayPlayer) => boolean = () => false
  ) {
    return (
      <div className={`${styles.playPicker} ${styles.playerPicker}`}>
        {options.map((player) => {
          const isDisabled =
            isOptionDisabled(player) || (intent === "guard" && player.id === playState.previousGuardTargetPlayerId);
          const isSelected = selectedPlayerId === player.id && !isDisabled;

          return (
            <button
              className={
                isSelected
                  ? `${styles.playOptionActive} ${getNightPickerActiveClassName(intent)}`
                  : `${styles.playOption} ${isDisabled ? styles.playOptionUnavailable : ""}`
              }
              key={player.id}
              type="button"
              disabled={isPending || isDisabled}
              onClick={() => {
                setMessage("");
                const nextPlayerId = selectedPlayerId === player.id ? null : player.id;
                setSelectedPlayerId(nextPlayerId);
                onSelect(nextPlayerId);
              }}
            >
              <span className={styles.playerOptionText}>{player.name}</span>
              <span
                aria-hidden="true"
                className={`${styles.playerOptionIconWrap} ${getNightPickerIconWrapClassName(intent)} ${
                  isSelected ? styles.playerOptionIconWrapVisible : ""
                }`}
              >
                {isSelected && renderNightPickerIcon(intent)}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderSeerReveal() {
    if (!playState.seerReveal || myRole !== "seer") {
      return null;
    }

    return (
      <div className={styles.werewolfTeammatePanel}>
        <span>Kết quả soi</span>
        <strong>
          {getPlayerName(playState.players, playState.seerReveal.targetPlayerId)}:{" "}
          {playState.seerReveal.isWerewolf ? "Là Sói" : "Không phải Sói"}
        </strong>
      </div>
    );
  }

  function renderWolfPackPanel() {
    if (myRole !== "werewolf" || playState.wolfPack.length === 0) {
      return null;
    }

    return (
      <div className={styles.wolfPackPanel}>
        <div className={styles.wolfPackHeader}>
          <span>Bầy sói</span>
          <strong>{playState.wolfPack.map((member) => member.name).join(", ")}</strong>
        </div>
      </div>
    );
  }

  function renderWolfNightTargetSelector(options: ClassicWolfPlayPlayer[]) {
    if (options.length === 0) {
      return <p>Không có mục tiêu hợp lệ trong đêm này.</p>;
    }

    return (
      <div className={styles.votingPanel}>
        <div className={styles.votingTitle}>
          <strong>Chọn nạn nhân</strong>
          <span>Các Ma Sói nhìn thấy lựa chọn của nhau trước khi chốt</span>
        </div>
        <div className={styles.votingOptions}>
          {options.map((player) => {
            const wolfVoters = wolfVotesByTarget.get(player.id) ?? [];
            const isSelected = activeWolfTargetPlayerId === player.id;

            return (
              <button
                className={`${styles.votingOption} ${isSelected ? styles.votingOptionActive : ""}`}
                key={player.id}
                type="button"
                disabled={isPending}
                onClick={() => selectWolfNightTarget(isSelected ? null : player.id)}
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
                  {wolfVoters.length > 5 ? (
                    <span className={styles.votingOptionVoterCount} aria-label={`${wolfVoters.length} Ma Sói`}>
                      {wolfVoters.length}
                    </span>
                  ) : wolfVoters.length > 0 ? (
                    <span className={styles.votingOptionVoters} aria-label={`${wolfVoters.length} Ma Sói`}>
                      {wolfVoters.map((wolfVoter) => (
                        <Image
                          alt=""
                          className={styles.votingOptionVoterAvatar}
                          height={28}
                          key={wolfVoter.id}
                          src={getPlayerAvatarSrc(wolfVoter.avatarKey, wolfVoter.avatarUrl)}
                          width={28}
                        />
                      ))}
                    </span>
                  ) : isSelected ? (
                    <Check aria-hidden="true" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderNightActions() {
    if (!myRole) {
      return <p>Bạn chưa có role trong ván này.</p>;
    }

    if (!isAlive) {
      return <p>Bạn đã chết. Hãy theo dõi người sống tiếp tục ván.</p>;
    }

    if (!isMyNightTurn && playState.seerReveal && myRole === "seer") {
      return (
        <>
          {renderSeerReveal()}
          <div className={styles.nightTurnWaiting}>
            <span>Ban đêm</span>
            <strong>Đang chờ hành động ban đêm</strong>
          </div>
        </>
      );
    }

    if (!isMyNightTurn) {
      return (
        <>
          {renderWolfPackPanel()}
          <div className={styles.nightTurnWaiting}>
            <span>Ban đêm</span>
            <strong>{activeNightTurn ? "Đang chờ hành động ban đêm" : "Đang tổng hợp kết quả ban đêm"}</strong>
            <p>Lượt và chức năng đang thực hiện được giữ kín.</p>
          </div>
        </>
      );
    }

    if (isSeerRevealPending) {
      return (
        <>
          {renderSeerReveal()}
          <div className={styles.nightTurnWaiting}>
            <span>Kết quả Tiên Tri</span>
            <strong>Ghi nhớ kết quả soi của bạn</strong>
            <p>Bấm OK sau khi đã xem xong để chuyển sang chức năng tiếp theo.</p>
          </div>
        </>
      );
    }

    if (isVillagerNightDecoyTurn) {
      return (
        <div className={styles.nightTurnWaiting}>
          <span>Lượt Dân Làng</span>
          <strong>Bạn thức dậy trong đêm</strong>
          <p>Không có mục tiêu cần chọn. Bấm hoàn tất để khép lượt đêm của bạn.</p>
        </div>
      );
    }

    if (playState.myNightAction) {
      return (
        <>
          {renderWolfPackPanel()}
          <div className={styles.nightTurnWaiting}>
            <span>Đã gửi hành động</span>
            <strong>Chờ các lượt còn lại</strong>
            <p>Hệ thống sẽ công bố người chết sau khi đêm kết thúc.</p>
          </div>
        </>
      );
    }

    if (myRole === "witch") {
      const canUsePoison = !playState.witchPoisonUsed;
      const canUseHeal = !playState.witchHealUsed && Boolean(playState.witchVictimPlayerId);
      const shouldAskRescue = canUseHeal && witchDecision === "rescue_prompt";
      const shouldAskPoison = (!canUseHeal && witchDecision === "rescue_prompt") || witchDecision === "poison_prompt";

      return (
        <>
          <div className={styles.nightTurnWaiting}>
            <span>Lượt Phù Thuỷ</span>
            <strong>{shouldAskRescue ? "Có muốn cứu người bị cắn không?" : "Chọn hành động trong đêm"}</strong>
            <p>
              {playState.witchVictimPlayerId
                ? "Sói đã cắn người trong đêm. Bạn chỉ có thể dùng một bình trong đêm này."
                : "Đêm này không ai chết vì Sói cắn. Bạn có muốn dùng bình độc để giết ai không?"}
            </p>
          </div>
          {playState.witchVictimPlayerId && (
            <div className={styles.playPicker}>
              <span
                className={`${styles.voteResultTop} ${
                  witchDecision === "rescue" ? styles.playOptionActiveHeal : ""
                }`}
              >
                {witchDecision === "rescue" && <FlaskConical aria-hidden="true" />}
                {getPlayerName(playState.players, playState.witchVictimPlayerId)} bị Sói cắn
              </span>
            </div>
          )}
          {shouldAskRescue && (
            <div className={styles.playPicker}>
              <button
                className={styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setSelectedPlayerId(null);
                  setWitchDecision("rescue");
                }}
              >
                Cứu {getPlayerName(playState.players, playState.witchVictimPlayerId)}
              </button>
              <button
                className={styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setSelectedPlayerId(null);
                  setWitchDecision(canUsePoison ? "poison_prompt" : "skip");
                }}
              >
                Không cứu
              </button>
            </div>
          )}
          {witchDecision === "rescue" && playState.witchVictimPlayerId && (
            <div className={styles.nightTurnWaiting}>
              <span>Bình cứu</span>
              <strong>Đang cứu {getPlayerName(playState.players, playState.witchVictimPlayerId)}</strong>
              <p>Đêm này bạn không thể dùng thêm bình độc.</p>
            </div>
          )}
          {shouldAskPoison && canUsePoison && (
            <div className={styles.playPicker}>
              <button
                className={styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => setWitchDecision("poison")}
              >
                Dùng bình độc
              </button>
              <button
                className={styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setSelectedPlayerId(null);
                  setWitchDecision("skip");
                }}
              >
                Không dùng
              </button>
            </div>
          )}
          {witchDecision === "poison" && canUsePoison && (
            <>
              <div className={styles.nightTurnWaiting}>
                <span>Bình độc</span>
                <strong>Chọn người còn sống để ném độc</strong>
              </div>
              {renderPlayerPicker(otherAlivePlayers, () => undefined, "witchPoison")}
              <button
                className={styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setSelectedPlayerId(null);
                  setWitchDecision("poison_prompt");
                }}
              >
                Huỷ dùng bình độc
              </button>
            </>
          )}
          {witchDecision === "skip" && (
            <div className={styles.nightTurnWaiting}>
              <span>Không dùng thuốc</span>
              <strong>Bạn sẽ bỏ qua lượt Phù Thuỷ đêm nay.</strong>
            </div>
          )}
          {!canUseHeal && !canUsePoison && <p>Bạn đã dùng hết thuốc trong ván này.</p>}
        </>
      );
    }

    const options =
      myRole === "guard"
        ? guardTargetOptions
        : myRole === "werewolf" || myRole === "seer" || myRole === "hunter"
          ? myRole === "werewolf"
            ? werewolfTargetOptions
            : otherAlivePlayers
          : alivePlayers;

    return (
      <>
        {renderWolfPackPanel()}
        <div className={styles.nightTurnWaiting}>
          <span>Lượt {CLASSIC_WOLF_ROLE_LABELS[myRole]}</span>
          <strong>{CLASSIC_WOLF_ROLE_DESCRIPTIONS[myRole]}</strong>
          {myRole === "guard" && playState.previousGuardTargetPlayerId && (
            <p>
              Đêm trước đã bảo vệ {getPlayerName(playState.players, playState.previousGuardTargetPlayerId)}, đêm nay
              phải chọn người khác.
            </p>
          )}
        </div>
        {myRole === "werewolf"
          ? renderWolfNightTargetSelector(werewolfTargetOptions)
          : options.length > 0
          ? renderPlayerPicker(
              options,
              () => undefined,
              getNightPickerIntentForRole(myRole)
            )
          : <p>Không có mục tiêu hợp lệ trong đêm này.</p>}
        {playState.seerReveal && myRole === "seer" && (
          <div className={styles.werewolfTeammatePanel}>
            <span>Kết quả soi</span>
            <strong>
              {getPlayerName(playState.players, playState.seerReveal.targetPlayerId)}:{" "}
              {playState.seerReveal.isWerewolf ? "Ma Sói" : "Không phải Ma Sói"}
            </strong>
          </div>
        )}
      </>
    );
  }

  const canSubmitNightAction =
    isMyNightTurn &&
    myRole &&
    (isSeerRevealPending ||
      isVillagerNightDecoyTurn ||
      (myRole === "witch"
        ? witchDecision === "rescue" || witchDecision === "skip" || (witchDecision === "poison" && Boolean(selectedPlayerId))
        : myRole === "guard"
          ? hasValidGuardSelection || availableGuardTargetCount === 0
          : myRole === "werewolf"
            ? Boolean(activeWolfTargetPlayerId)
          : Boolean(selectedPlayerId)));
  const deadPlayers = playState.players.filter((player) => !player.isAlive);
  const submittedVotesCount = alivePlayers.filter((player) => player.hasVoted).length;
  const skippedVotesCount = alivePlayers.filter((player) => player.hasVoted && player.voteTargetPlayerId === null).length;
  const votersByTarget = new Map<string, ClassicWolfPlayPlayer[]>();

  for (const player of alivePlayers) {
    const localVoteSelection =
      player.id === playState.currentPlayerId && !player.hasVoted
        ? optimisticVoteTargetPlayerId ?? selectedVoteTargetPlayerId
        : null;
    const voteTargetPlayerId = player.hasVoted
      ? player.voteTargetPlayerId
      : localVoteSelection
        ? localVoteSelection === VOTE_SKIP_KEY
          ? null
          : localVoteSelection
        : player.hasVoteSelection
          ? player.voteSelectionTargetPlayerId
          : null;

    if (voteTargetPlayerId) {
      const voters = votersByTarget.get(voteTargetPlayerId) ?? [];

      if (!voters.some((voter) => voter.id === player.id)) {
        votersByTarget.set(voteTargetPlayerId, [...voters, player]);
      }
    }
  }

  const pendingVotesCount = Math.max(0, alivePlayers.length - submittedVotesCount);
  const canConfirmVote =
    isVotingPhase &&
    isAlive &&
    !currentPlayer?.hasVoted &&
    activeVoteTargetPlayerId !== null &&
    !isPending;

  function unlockPrivateRoleReveal() {
    setRevealedRoleGameId(playState.game.id);
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

    if (coverPointerStartY - event.clientY >= 44) {
      unlockPrivateRoleReveal();
    }

    setCoverDragOffset(Math.max(nextOffset, -maxLift));
  }

  function endPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY !== null && coverPointerStartY - event.clientY >= 44) {
      unlockPrivateRoleReveal();
    }

    setCoverPointerStartY(null);
    setCoverDragOffset(0);
  }

  function renderPrivateRoleCover() {
    return (
      <div
        aria-hidden={isPrivateRoleRevealed}
        className={`${styles.privateRevealCover} ${coverPointerStartY !== null ? styles.privateRevealCoverDragging : ""}`}
        style={{ transform: `translateY(${coverDragOffset}px)` }}
        onClick={unlockPrivateRoleReveal}
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
          priority
          sizes="(max-width: 768px) 100vw, 32rem"
          src={PRIVATE_CARD_COVER_IMAGE_PATH}
        />
        <span className={styles.privateRevealHandle}>
          <ArrowUp aria-hidden="true" />
        </span>
        <span className={styles.privateRevealHint}>Kéo lên để xem vai</span>
      </div>
    );
  }

  function renderNightHistoryIcon() {
    return <Shield aria-label="Được bảo vệ" className={styles.nightHistoryIcon} />;
  }

  function renderNightHistoryRoleIcon(
    role: ClassicWolfPlayState["nightHistory"][number]["actionDescriptions"][number]["role"]
  ) {
    if (role === "guard") {
      return <Shield aria-hidden="true" />;
    }

    if (role === "seer") {
      return <Eye aria-hidden="true" />;
    }

    if (role === "witch") {
      return <FlaskConical aria-hidden="true" />;
    }

    if (role === "hunter") {
      return <BadgeCheck aria-hidden="true" />;
    }

    if (role === "result") {
      return <BadgeCheck aria-hidden="true" />;
    }

    if (role === "vote") {
      return <Check aria-hidden="true" />;
    }

    return null;
  }

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
        isCardRevealPhase || isNightReviewPhase ? styles.focusedPlayPage : ""
      } ${isNightReviewPhase ? styles.nightReviewPage : ""} ${isCardRevealPhase ? styles.cardRevealPage : ""} ${
        (isNightPhase && isMyNightTurn) || isDiscussionPhase ? styles.fixedBottomActionPage : ""
      } ${
        (isNightPhase && !isMyNightTurn) || isVotingPhase ? styles.fixedBottomWaitingPage : ""
      }`}
    >
      <section
        className={`${styles.playHeader} ${isDiscussionPhase ? styles.discussionHeader : ""} ${
          isVotingPhase ? styles.votingHeader : ""
        } ${isResultPhase ? styles.resultHeader : ""}`}
      >
        <div>
          <span>Phòng {playState.room.code.toUpperCase()} · Đêm {playState.game.roundNumber}</span>
          <h1>{currentPhaseLabel}</h1>
        </div>
        {isCardRevealPhase && <p>Xem vai bí mật của bạn. Khi đã nhớ role, bấm OK.</p>}
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
        {isNightPhase && (
          <p>
            {isMyNightTurn && myRole
              ? CLASSIC_WOLF_ROLE_DESCRIPTIONS[myRole]
              : "Đêm đang diễn ra. Chờ đến lượt hoặc chờ hệ thống công bố kết quả."}
          </p>
        )}
        {isNightReviewPhase && (
          <p>
            {isDayReviewPhase
              ? `Kết quả của đêm ${reviewEvent?.roundNumber ?? playState.game.roundNumber} và ngày ${
                  reviewEvent?.roundNumber ?? playState.game.roundNumber
                }. Xác nhận xong mới sang đêm tiếp theo.`
              : "Thông báo người chết trong đêm."}
          </p>
        )}
        {isDiscussionPhase && (
          <p>Người sống thảo luận để tìm Ma Sói. Khi tất cả đã thảo luận xong, ván sẽ tự chuyển sang bỏ phiếu.</p>
        )}
        {isVotingPhase && (
          <p>Người sống chọn một người để treo cổ, hoặc bỏ qua.</p>
        )}
        {isResultPhase && playState.result && (
          <strong className={`${styles.resultBanner} ${isCurrentPlayerWinner === false ? styles.resultBannerDanger : ""}`}>
            {playState.result.winnerText}
          </strong>
        )}
      </section>

      {!isDiscussionPhase && (
        <section
          className={`${styles.playPanel} ${isCardRevealPhase || isNightReviewPhase ? styles.focusedPlayPanel : ""} ${
            isNightPhase ? styles.classicWolfNightPanel : ""
          }`}
        >
          {isCardRevealPhase && (
            <div className={styles.privateRevealBox}>
              <RoleCard role={myRole} />
              {renderPrivateRoleCover()}
            </div>
          )}

          {isNightPhase && renderNightActions()}

          {isNightReviewPhase && (
            <>
              <div className={styles.nightReviewContent}>
                <span className={styles.nightReviewKicker}>
                  {isDayReviewPhase
                    ? `Ngày ${reviewEvent?.roundNumber ?? playState.game.roundNumber}`
                    : `Đêm ${reviewEvent?.roundNumber ?? playState.game.roundNumber}`}
                </span>
                <p>{reviewEvent?.reason ?? "Đêm đã kết thúc."}</p>
                {isDayReviewPhase && (
                  <div className={styles.reviewSummaryGrid}>
                    <div className={styles.reviewSummaryItem}>
                      <span>Đêm {reviewEvent?.roundNumber ?? playState.game.roundNumber}</span>
                      <strong>
                        {reviewNightDeathPlayerIds.length > 0
                          ? reviewNightDeathPlayerIds.map((playerId) => getPlayerName(playState.players, playerId)).join(", ")
                          : "Không ai chết"}
                      </strong>
                    </div>
                    <div className={styles.reviewSummaryItem}>
                      <span>Ngày {reviewEvent?.roundNumber ?? playState.game.roundNumber}</span>
                      <strong>
                        {reviewDayDeathPlayerIds.length > 0
                          ? reviewDayDeathPlayerIds.map((playerId) => getPlayerName(playState.players, playerId)).join(", ")
                          : "Không ai bị treo cổ"}
                      </strong>
                    </div>
                  </div>
                )}
                {isDayReviewPhase && (
                  <div className={styles.voteReviewTable} role="table" aria-label="Bảng kết quả lượt vote">
                    <div className={`${styles.voteReviewRow} ${styles.voteReviewHeader}`} role="row">
                      <span role="columnheader">Người chơi</span>
                      <span role="columnheader">Người vote</span>
                    </div>
                    {voteReviewRows.map((row) => (
                      <div className={styles.voteReviewRow} role="row" key={row.id}>
                        <strong className={row.isEliminated ? styles.voteReviewTargetEliminated : undefined} role="cell">
                          {row.targetName}
                        </strong>
                        <span className={row.voterNames.length > 0 ? styles.voteReviewVoters : styles.voteReviewMuted} role="cell">
                          {row.voterNames.length > 0 ? row.voterNames.join(", ") : "Không có"}
                        </span>
                      </div>
                    ))}
                    {skippedVoteReviewVoters.length > 0 && (
                      <div className={styles.voteReviewRow} role="row">
                        <strong role="cell">Bỏ qua</strong>
                        <span className={styles.voteReviewVoters} role="cell">
                          {skippedVoteReviewVoters.map((player) => player.name).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {reviewEvent && reviewEvent.playerIds.length > 0 ? (
                  <div className={styles.playPicker}>
                    {reviewEvent.playerIds.map((playerId) => (
                      <span className={styles.voteResultTop} key={playerId}>
                        {getPlayerName(playState.players, playerId)} {reviewEvent.phase === "day" ? "bị treo cổ" : "đã chết"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>{isDayReviewPhase ? "Không ai bị treo cổ trong lượt này." : "Không ai chết trong lượt này."}</p>
                )}
              </div>
            </>
          )}
          {isVotingPhase && (
            isAlive ? (
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
                    disabled={isPending || currentPlayer?.hasVoted}
                    onClick={() => selectVoteTarget(null)}
                  >
                    <span className={styles.votingOptionAvatar}>
                      <X aria-hidden="true" />
                    </span>
                    <span>Bỏ qua</span>
                    <span className={styles.votingOptionCheck} />
                  </button>
                  {alivePlayers.map((player) => {
                    const voters = votersByTarget.get(player.id) ?? [];

                    return (
                      <button
                        className={`${styles.votingOption} ${
                          activeVoteTargetPlayerId === player.id ? styles.votingOptionActive : ""
                        }`}
                        key={player.id}
                        type="button"
                        disabled={isPending || currentPlayer?.hasVoted || player.id === playState.currentPlayerId}
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
                            <span className={styles.votingOptionVoterCount} aria-label={`${voters.length} phiếu`}>
                              {voters.length}
                            </span>
                          ) : voters.length > 0 ? (
                            <span className={styles.votingOptionVoters} aria-label={`${voters.length} phiếu`}>
                              {voters.map((voter) => (
                                <Image
                                  alt=""
                                  className={styles.votingOptionVoterAvatar}
                                  height={28}
                                  key={voter.id}
                                  src={getPlayerAvatarSrc(voter.avatarKey, voter.avatarUrl)}
                                  width={28}
                                />
                              ))}
                            </span>
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
                      {submittedVotesCount}/{alivePlayers.length}
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
            ) : (
              <div className={styles.nightTurnWaiting}>
                <span>Bỏ phiếu</span>
                <strong>Bạn đã chết nên lượt bỏ phiếu được bỏ qua.</strong>
                <p>Người sống có thể tiếp tục bình chọn mà không cần chờ bạn.</p>
              </div>
            )
          )}

          {isResultPhase && playState.result && (
            <>
              <div className={styles.nightlyResultHeader}>
                <div className={styles.nightlyResultTitleRow}>
                  <div>
                    <h2>Tóm tắt</h2>
                  </div>
                </div>
              </div>
              <div className={styles.nightlyResultPlayers}>
                {playState.players.map((player) => (
                  <div className={styles.nightlyResultPlayerRow} key={player.id}>
                    <Image
                      alt=""
                      className={styles.nightlyResultAvatar}
                      height={44}
                      src={getPlayerAvatarSrc(player.avatarKey, player.avatarUrl)}
                      width={44}
                    />
                    <div className={styles.nightlyResultPlayerInfo}>
                      <strong>{player.name}</strong>
                      <span className={player.isAlive ? styles.nightlyResultAlive : styles.nightlyResultDead}>
                        {!player.isAlive && <Skull aria-hidden="true" />}
                        {player.isAlive ? "Sống sót" : "Đã chết"}
                      </span>
                    </div>
                    <span className={getResultRoleClassName(player.role)}>
                        {player.role ? CLASSIC_WOLF_ROLE_LABELS[player.role] : "Không rõ"}
                    </span>
                  </div>
                ))}
              </div>
              {playState.nightHistory.length > 0 && (
                <div className={styles.nightHistoryGrid}>
                  {playState.nightHistory.map((nightHistory) => (
                    <div className={styles.nightHistoryRow} key={nightHistory.nightNumber}>
                      <strong className={styles.nightHistoryNight}>
                        <Moon aria-hidden="true" />
                        Đêm {nightHistory.nightNumber}
                      </strong>
                      <div className={styles.nightHistoryEvents}>
                        {nightHistory.actionDescriptions.map((description, index) => (
                          <span className={styles.nightHistoryEvent} key={`${nightHistory.nightNumber}-${index}`}>
                            <span className={getNightHistoryRoleClassName(description.role)}>
                              {renderNightHistoryRoleIcon(description.role)}
                              {getNightHistoryRoleLabel(description.role)}
                            </span>
                            <span className={styles.nightHistoryEventText}>
                              <span>{description.text}</span>
                              {description.icons.length > 0 && (
                                <span className={styles.nightHistoryIconStack}>
                                  {description.icons.map((icon) => (
                                    <span className={styles.nightHistoryIconBadge} key={icon}>
                                      {renderNightHistoryIcon()}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                          </span>
                        ))}
                        <span className={styles.nightHistoryEvent}>
                          <span className={getNightHistoryRoleClassName("result")}>
                            {renderNightHistoryRoleIcon("result")}
                            Kết quả
                          </span>
                          <strong className={styles.nightHistoryResult}>
                            {nightHistory.deathSummary.replace(/^Kết quả:\s*/, "")}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {message && <p className={styles.inlineError}>{message}</p>}
        </section>
      )}

      {isDiscussionPhase && roleDeckSummary.length > 0 && (
        <section className={`${styles.discussionRoleDeck} ${styles.discussionPanel}`}>
          <div className={styles.discussionSectionTitle}>
            <span>Tình hình hiện tại</span>
            {renderNightReminderButton()}
          </div>
          <div className={styles.discussionStatusGrid}>
            <div className={`${styles.discussionStatusRow} ${styles.discussionStatusDead}`}>
              <span className={styles.discussionStatusIcon}>
                <Skull aria-hidden="true" />
              </span>
              <div className={styles.discussionStatusContent}>
                <span>Đã chết</span>
                <strong>
                  {deadPlayers.length > 0 ? deadPlayers.map((player) => player.name).join(", ") : "Không ai chết"}
                </strong>
              </div>
              <strong className={styles.discussionStatusCount}>{deadPlayers.length} người</strong>
            </div>
            <div className={`${styles.discussionStatusRow} ${styles.discussionStatusAlive}`}>
              <span className={styles.discussionStatusIcon}>
                <Users aria-hidden="true" />
              </span>
              <div className={styles.discussionStatusContent}>
                <span>Còn sống</span>
                <strong>{alivePlayers.map((player) => player.name).join(", ")}</strong>
              </div>
              <strong className={styles.discussionStatusCount}>{alivePlayers.length} người</strong>
            </div>
          </div>

          <div className={styles.discussionSectionTitle}>
            <span>Vai trò trong ván</span>
          </div>
          <div className={`${styles.roleDeckGrid} ${styles.discussionRoleGrid}`}>
            {roleDeckSummary.map((roleSummary) => (
              <article
                key={roleSummary.role}
                className={`${styles.roleDeckTile} ${styles.discussionRoleTile} ${
                  roleSummary.role === "werewolf" ? styles.roleDeckTileWolf : ""
                }`}
              >
                <button
                  aria-label={`Xem hướng dẫn ${CLASSIC_WOLF_ROLE_LABELS[roleSummary.role]}`}
                  className={styles.roleDeckInfoButton}
                  type="button"
                  onClick={() => setSelectedRoleGuide(roleSummary.role)}
                >
                  <CircleAlert aria-hidden="true" />
                </button>
                <span className={styles.discussionRoleIcon}>{renderDiscussionRoleIcon(roleSummary.role)}</span>
                <strong>{CLASSIC_WOLF_ROLE_LABELS[roleSummary.role]}</strong>
                <span>{roleSummary.count} role</span>
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
            disabled={isPending || currentPlayer?.isPhaseReady || !isPrivateRoleRevealed}
            onClick={() => confirmCurrentPhase("Đang xác nhận đã xem vai...")}
          >
            <Check aria-hidden="true" />
            {currentPlayer?.isPhaseReady ? "Đã OK" : "OK, tôi đã xem vai"}
          </button>
        </section>
      )}

      {isNightPhase && isMyNightTurn && (
        <section className={`${styles.cardRevealActionBar} ${styles.classicWolfNightActionBar}`}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!canSubmitNightAction || isPending}
            onClick={
              isSeerRevealPending
                ? () => confirmCurrentPhase("Đang xác nhận đã xem kết quả soi...")
                : isVillagerNightDecoyTurn
                  ? () => confirmCurrentPhase("Đang xác nhận lượt ban đêm...")
                : submitNightAction
            }
          >
            <Check aria-hidden="true" />
            {isSeerRevealPending ? "OK, tôi đã xem kết quả" : "Hoàn tất lượt đêm"}
          </button>
        </section>
      )}

      {isNightReviewPhase && (
        <section className={styles.cardRevealActionBar}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || !isAlive || currentPlayer?.isPhaseReady}
            onClick={() =>
              confirmCurrentPhase(isDayReviewPhase ? "Đang xác nhận đã xem kết quả..." : "Đang xác nhận đã xem thông báo...")
            }
          >
            <Check aria-hidden="true" />
            {currentPlayer?.isPhaseReady
              ? "Đã xong"
              : isAlive
                ? isDayReviewPhase
                  ? "OK, đã xem kết quả"
                  : "Xong, tiếp tục"
                : "Đang theo dõi"}
          </button>
        </section>
      )}

      {isDiscussionPhase && (
        <section className={`${styles.cardRevealActionBar} ${styles.classicWolfDiscussionActionBar}`}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || !isAlive || currentPlayer?.isPhaseReady}
            onClick={() => confirmCurrentPhase("Đang xác nhận thảo luận xong...")}
          >
            <Check aria-hidden="true" />
            {currentPlayer?.isPhaseReady ? "Đã sẵn sàng vote" : isAlive ? "Tôi đã thảo luận xong" : "Đang theo dõi"}
          </button>
        </section>
      )}

      {!isResultPhase && (
        <section
          className={`${styles.playWaitingStatus} ${
            isCardRevealPhase ? styles.cardRevealWaitingStatus : styles.focusedWaitingStatus
          } ${
            isNightPhase ? styles.classicWolfNightStatus : ""
          }`}
          aria-live="polite"
        >
          <span>{getWaitingStatusText()}</span>
        </section>
      )}

      {isResultPhase && (
        <section className={styles.resultActionBar}>
          {playState.isCurrentPlayerHost && (
            <button className={styles.primaryButton} type="button" disabled={isPending} onClick={returnToLobby}>
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
            aria-labelledby="classic-wolf-night-reminder-title"
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
            <h2 id="classic-wolf-night-reminder-title">Hành động đêm trước</h2>
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
            aria-labelledby="classic-wolf-role-guide-title"
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
            <h2 id="classic-wolf-role-guide-title">{CLASSIC_WOLF_ROLE_LABELS[selectedRoleGuide]}</h2>
            <div className={styles.roleGuideSection}>
              <span>Chức năng</span>
              <p>{CLASSIC_WOLF_ROLE_DESCRIPTIONS[selectedRoleGuide]}</p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
