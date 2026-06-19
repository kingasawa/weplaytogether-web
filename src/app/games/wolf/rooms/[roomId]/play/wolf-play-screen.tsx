"use client";

import { ArrowRight, ArrowUp, Check, CircleAlert, LoaderCircle, LogOut, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import type { WolfRole } from "@/lib/supabase/types";
import {
  getWolfRoleImagePath,
  WOLF_PHASE_LABELS,
  WOLF_ROLE_DESCRIPTIONS,
  WOLF_ROLE_LABELS,
} from "@/lib/wolf-game";
import {
  advanceWolfDiscussionIfExpired,
  finishWolfGame,
  getWolfPlayState,
  leaveWolfRoom,
  revealWolfCenterCard,
  submitWolfPhaseConfirmation,
  submitWolfNightAction,
  submitWolfVote,
  type WolfCenterRevealResult,
  type WolfGameResult,
  type WolfPlayPlayer,
  type WolfPlayState,
} from "../../../actions";
import styles from "../../../page.module.css";

type WolfPlayScreenProps = {
  initialState: WolfPlayState;
};

const VOTE_SKIP_KEY = "__skip_vote__";
const PRIVATE_CARD_COVER_IMAGE_PATH = "/images/ui/mask_card.png";

type RevealedCenterCard = Extract<WolfCenterRevealResult, { ok: true }>;
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
  copycat: "Thắng cùng phe dân theo luật hiện tại của game.",
};

type RoleCardProps = {
  role: WolfRole | null;
  label: string;
  isHidden?: boolean;
};

function isPrivateRevealPhase(phase: WolfPlayState["game"]["phase"]) {
  return phase === "card_reveal" || phase === "night_review";
}

function RoleCard({ role, label, isHidden = false }: RoleCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const roleLabel = role ? WOLF_ROLE_LABELS[role] : "Úp bài";

  return (
    <article className={`${styles.playCard} ${isHidden ? styles.playCardHidden : ""}`}>
      <span>{label}</span>
      {role && !imageFailed && (
        <Image
          alt={roleLabel}
          fill
          sizes="(max-width: 768px) 33vw, 16rem"
          src={getWolfRoleImagePath(role)}
          onError={() => setImageFailed(true)}
        />
      )}
      {(!role || imageFailed) && <strong>{isHidden ? "?" : roleLabel}</strong>}
    </article>
  );
}

function getPlayerName(players: WolfPlayPlayer[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "Không rõ";
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
  const [revealingCenterIndexes, setRevealingCenterIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [optimisticVoteTargetPlayerId, setOptimisticVoteTargetPlayerId] = useState<string | null>(null);
  const [unlockedPrivateRevealKey, setUnlockedPrivateRevealKey] = useState<string | null>(
    isPrivateRevealPhase(initialState.game.phase) ? null : `${initialState.game.id}:${initialState.game.phase}`
  );
  const [coverPointerStartY, setCoverPointerStartY] = useState<number | null>(null);
  const [coverDragOffset, setCoverDragOffset] = useState(0);
  const [selectedRoleGuide, setSelectedRoleGuide] = useState<WolfRole | null>(null);
  const autoAdvancedDiscussionGameIdRef = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  const myRole = playState.myCard?.originalRole ?? null;
  const otherPlayers = playState.players.filter((player) => player.id !== playState.currentPlayerId);
  const getRevealedCenterRole = (centerIndex: number) =>
    revealedCenterCards.find((card) => card.centerIndex === centerIndex)?.role ??
    playState.centerCards.find((card) => card.index === centerIndex)?.role ??
    null;
  const hasCenterReveal = (centerIndex: number) => Boolean(getRevealedCenterRole(centerIndex));
  const viewedCenterIndexes = playState.centerCards
    .filter((card) => hasCenterReveal(card.index))
    .map((card) => card.index);
  const copycatCopiedRole =
    myRole === "copycat" && selectedCenterIndexes.length > 0
      ? getRevealedCenterRole(selectedCenterIndexes[0])
      : null;
  const usesTroublemakerSelection = myRole === "troublemaker" || copycatCopiedRole === "troublemaker";
  const usesWitchSelection = myRole === "witch" || copycatCopiedRole === "witch";
  const playerPickerOptions = usesWitchSelection ? playState.players : otherPlayers;
  const hasWerewolfTeammates =
    (myRole === "werewolf" || myRole === "werewolf_seer") && playState.werewolfTeammates.length > 0;
  const myActionSubmitted = Boolean(playState.myAction);
  const activeVoteTargetPlayerId =
    optimisticVoteTargetPlayerId ??
    (playState.players.find((player) => player.id === playState.currentPlayerId)?.hasSkippedVote
      ? VOTE_SKIP_KEY
      : playState.myVoteTargetPlayerId);
  const isCardRevealPhase = playState.game.phase === "card_reveal";
  const isNightPhase = playState.game.phase === "night";
  const isNightReviewPhase = playState.game.phase === "night_review";
  const isDiscussionPhase = playState.game.phase === "discussion";
  const isVotingPhase = playState.game.phase === "voting";
  const isResultPhase = playState.game.phase === "result";
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
  const privateRevealKey = isPrivateRevealPhase(playState.game.phase)
    ? `${playState.game.id}:${playState.game.phase}`
    : null;
  const privateRevealUnlocked = privateRevealKey === null || unlockedPrivateRevealKey === privateRevealKey;
  const discussionSecondsLeft = playState.game.discussionEndsAt
    ? Math.max(0, Math.ceil((new Date(playState.game.discussionEndsAt).getTime() - now) / 1000))
    : null;
  const isCenterRevealPending = revealingCenterIndexes.length > 0;
  const copiedSeerCenterPathStarted =
    myRole === "copycat" &&
    copycatCopiedRole === "seer" &&
    viewedCenterIndexes.length > 1;
  const centerRevealLimit =
    myRole === "seer"
      ? 2
      : myRole === "witch"
        ? 1
        : myRole === "werewolf" && !hasWerewolfTeammates
          ? 1
          : myRole === "copycat" &&
            (selectedCenterIndexes.length === 0 ||
              !copycatCopiedRole ||
              copycatCopiedRole === "seer" ||
              copycatCopiedRole === "witch")
            ? copycatCopiedRole === "seer"
              ? 3
              : copycatCopiedRole === "witch"
                ? 2
                : 1
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
      return playState.players.filter((player) => !player.hasNightAction);
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

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (
      playState.game.phase !== "discussion" ||
      discussionSecondsLeft !== 0 ||
      autoAdvancedDiscussionGameIdRef.current === playState.game.id
    ) {
      return;
    }

    autoAdvancedDiscussionGameIdRef.current = playState.game.id;
    startTransition(async () => {
      const result = await advanceWolfDiscussionIfExpired(playState.room.code);

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      await refreshPlayState();
    });
  }, [
    discussionSecondsLeft,
    playState.game.id,
    playState.game.phase,
    playState.room.code,
    refreshPlayState,
  ]);

  function togglePlayerSelection(playerId: string) {
    setMessage("");
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
    if (hasCenterReveal(centerIndex) || revealingCenterIndexes.includes(centerIndex)) {
      return;
    }

    setRevealingCenterIndexes((current) =>
      current.includes(centerIndex) ? current : [...current, centerIndex]
    );
    try {
      const result = await revealWolfCenterCard(playState.room.code, centerIndex);

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
      myRole === "seer" ||
      myRole === "witch" ||
      (myRole === "copycat" &&
        (selectedCenterIndexes.length === 0 ||
          copycatCopiedRole === "seer" ||
          copycatCopiedRole === "witch")) ||
      (myRole === "werewolf" && !hasWerewolfTeammates);
    const isDeselecting = selectedCenterIndexes.includes(centerIndex);

    if (myRole === "witch") {
      if (isDeselecting && hasCenterReveal(centerIndex)) {
        setMessage("Lá giữa đã xem sẽ được giữ để Phù Thuỷ gán cho người nhận.");
        return;
      }

      if (!isDeselecting && viewedCenterIndexes.length >= 1 && !hasCenterReveal(centerIndex)) {
        setMessage("Phù Thuỷ chỉ được xem một lá giữa bàn.");
        return;
      }

      setSelectedCenterIndexes(isDeselecting ? [] : [centerIndex]);

      if (!isDeselecting) {
        void revealCenterCard(centerIndex);
      }

      return;
    }

    if (myRole === "seer" || (myRole === "copycat" && copycatCopiedRole === "seer")) {
      if (!isDeselecting && selectedPlayerIds.length > 0) {
        setMessage("Bạn đã chọn xem người chơi nên không thể xem thêm lá giữa.");
        return;
      }

      setSelectedPlayerIds([]);
    }

    const maxCenterSelections =
      myRole === "copycat" && copycatCopiedRole === "seer" ? 3 : 2;

    if (!isDeselecting && (myRole === "seer" || myRole === "copycat") && selectedCenterIndexes.length >= maxCenterSelections) {
      setMessage("Bạn đã chọn đủ số lá giữa cho hành động này.");
      return;
    }

    if (
      !isDeselecting &&
      canRevealCenterImmediately &&
      !hasCenterReveal(centerIndex) &&
      viewedCenterIndexes.length >= centerRevealLimit
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
        viewedCenterIndexes.length >= centerRevealLimit
      ) {
        setMessage(`Bạn chỉ được xem tối đa ${centerRevealLimit} lá giữa bàn trong lượt này.`);
        return current;
      }

      if (myRole === "seer" || myRole === "copycat") {
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

    setMessage("");
    setPendingLabel("Đang lưu hành động ban đêm...");
    startTransition(async () => {
      const result = await submitWolfNightAction(playState.room.code, {
        actionType: myRole,
        targetPlayerId: selectedPlayerIds[0] ?? null,
        targetPlayerId2: selectedPlayerIds[1] ?? null,
        targetCenterIndex: hasWerewolfTeammates ? null : selectedCenterIndexes[0] ?? null,
        targetCenterIndex2: hasWerewolfTeammates ? null : selectedCenterIndexes[1] ?? null,
        targetCenterIndex3: hasWerewolfTeammates ? null : selectedCenterIndexes[2] ?? null,
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
      setOptimisticVoteTargetPlayerId(null);
      setPendingLabel("");
    });
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

  function exitGame() {
    setMessage("");
    setPendingLabel("Đang thoát phòng...");
    startTransition(async () => {
      await leaveWolfRoom(playState.room.code);
      router.push("/games/wolf");
    });
  }

  function startPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    setCoverPointerStartY(event.clientY);
    setCoverDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY === null) {
      return;
    }

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

  function renderNightActions() {
    if (!myRole) {
      return <p>Bạn chưa có bài trong ván này.</p>;
    }

    if (myActionSubmitted) {
      return <p>Hành động của bạn đã được lưu. Chờ các người chơi khác hoàn tất.</p>;
    }

    const needsPlayerPicker =
      myRole === "seer" ||
      myRole === "werewolf_seer" ||
      myRole === "robber" ||
      myRole === "troublemaker" ||
      myRole === "witch" ||
      (myRole === "copycat" &&
        (copycatCopiedRole === "seer" ||
          copycatCopiedRole === "werewolf_seer" ||
          copycatCopiedRole === "robber" ||
          copycatCopiedRole === "troublemaker" ||
          copycatCopiedRole === "witch"));
    const needsCenterPicker =
      myRole === "seer" ||
      myRole === "witch" ||
      myRole === "drunk" ||
      myRole === "copycat" ||
      (myRole === "werewolf" && !hasWerewolfTeammates);
    const isPlayerPickerDisabled =
      isCenterRevealPending ||
      (myRole === "seer" && viewedCenterIndexes.length > 0) ||
      copiedSeerCenterPathStarted;
    return (
      <>
        {hasWerewolfTeammates && (
          <div className={styles.werewolfTeammatePanel}>
            <span>Ma Sói cùng phe</span>
            <strong>{playState.werewolfTeammates.map((player) => player.playerName).join(", ")}</strong>
            <p>Vì có từ 2 Ma Sói trở lên, bạn không được xem lá giữa bàn.</p>
          </div>
        )}

        {needsPlayerPicker && (
          <div className={styles.playPicker}>
            <span>Chọn người chơi</span>
            {playerPickerOptions.map((player) => (
              <button
                className={selectedPlayerIds.includes(player.id) ? styles.playOptionActive : styles.playOption}
                key={player.id}
                type="button"
                disabled={isPending || isPlayerPickerDisabled}
                onClick={() => togglePlayerSelection(player.id)}
              >
                {player.id === playState.currentPlayerId ? "Tôi" : player.name}
              </button>
            ))}
          </div>
        )}

        {needsCenterPicker && (
          <div className={styles.playPicker}>
            <span>Chọn lá giữa bàn</span>
            {playState.centerCards.map((card) => {
              const isCenterLoading = revealingCenterIndexes.includes(card.index);
              const revealedRole =
                selectedCenterIndexes.includes(card.index) || card.role
                  ? getRevealedCenterRole(card.index)
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
                  {isCenterLoading ? " - Đang mở..." : revealedRole ? ` - ${WOLF_ROLE_LABELS[revealedRole]}` : ""}
                </button>
              );
            })}
          </div>
        )}

      </>
    );
  }

  const selectedCenterRevealsLoaded =
    myRole === "seer"
      ? viewedCenterIndexes.length > 0
        ? selectedCenterIndexes.length === 2 && selectedCenterIndexes.every(hasCenterReveal)
        : selectedPlayerIds.length === 1 || selectedCenterIndexes.every(hasCenterReveal)
      : myRole === "witch"
        ? selectedCenterIndexes.length === 1 && selectedCenterIndexes[0] != null && hasCenterReveal(selectedCenterIndexes[0])
        : myRole === "werewolf"
          ? hasWerewolfTeammates ||
            selectedCenterIndexes.length === 0 ||
            (selectedCenterIndexes[0] != null && hasCenterReveal(selectedCenterIndexes[0]))
          : myRole === "copycat"
            ? selectedCenterIndexes.length >= 1 &&
              selectedCenterIndexes[0] != null &&
              hasCenterReveal(selectedCenterIndexes[0]) &&
              (copycatCopiedRole === "seer"
                ? selectedCenterIndexes.length < 3 ||
                  ((selectedCenterIndexes[1] != null && hasCenterReveal(selectedCenterIndexes[1])) &&
                    (selectedCenterIndexes[2] != null && hasCenterReveal(selectedCenterIndexes[2])))
                : copycatCopiedRole === "witch"
                  ? selectedCenterIndexes.length < 2 ||
                    (selectedCenterIndexes[1] != null && hasCenterReveal(selectedCenterIndexes[1]))
                : true)
            : true;
  const canSubmitNightAction =
    myRole === "villager" ||
    myRole === "insomniac" ||
    (myRole === "werewolf" && (hasWerewolfTeammates ? selectedCenterIndexes.length === 0 : selectedCenterIndexes.length <= 1)) ||
    (myRole === "werewolf_seer" && selectedPlayerIds.length === 1) ||
    (myRole === "robber" && selectedPlayerIds.length === 1) ||
    (myRole === "troublemaker" && selectedPlayerIds.length === 2) ||
    (myRole === "witch" && selectedPlayerIds.length === 1 && selectedCenterIndexes.length === 1) ||
    (myRole === "drunk" && selectedCenterIndexes.length === 1) ||
    (myRole === "seer" &&
      (viewedCenterIndexes.length > 0
        ? selectedCenterIndexes.length === 2
        : selectedPlayerIds.length === 1 || selectedCenterIndexes.length === 2)) ||
    (myRole === "copycat" &&
      selectedCenterIndexes.length >= 1 &&
      (copycatCopiedRole === "villager" ||
        copycatCopiedRole === "insomniac" ||
        copycatCopiedRole === "werewolf" ||
        copycatCopiedRole === "copycat" ||
        (copycatCopiedRole === "seer" &&
          (copiedSeerCenterPathStarted
            ? selectedCenterIndexes.length === 3
            : selectedPlayerIds.length === 1 || selectedCenterIndexes.length === 3)) ||
        (copycatCopiedRole === "werewolf_seer" && selectedPlayerIds.length === 1) ||
        (copycatCopiedRole === "robber" && selectedPlayerIds.length === 1) ||
        (copycatCopiedRole === "troublemaker" && selectedPlayerIds.length === 2) ||
        (copycatCopiedRole === "witch" && selectedPlayerIds.length === 1 && selectedCenterIndexes.length === 2) ||
        (copycatCopiedRole === "drunk" && selectedCenterIndexes.length === 2)));
  const canSubmitResolvedNightAction =
    canSubmitNightAction && selectedCenterRevealsLoaded && !isCenterRevealPending;

  return (
    <main
      className={`${styles.page} ${styles.playPage} ${usesFocusedRevealLayout ? styles.focusedPlayPage : ""} ${
        (isNightPhase && !myActionSubmitted && myRole) || isDiscussionPhase ? styles.fixedBottomActionPage : ""
      } ${isVotingPhase ? styles.fixedBottomWaitingPage : ""}`}
    >
      <section className={styles.playHeader}>
        <div>
          <span>Phòng {playState.room.code.toUpperCase()}</span>
          <h1>{WOLF_PHASE_LABELS[playState.game.phase]}</h1>
        </div>
        {isCardRevealPhase && (
          <p>
            Hãy xem kĩ lá bài của bạn và ghi nhớ nó
          </p>
        )}
        {isNightPhase && <p>{myRole ? WOLF_ROLE_DESCRIPTIONS[myRole] : "Bạn chưa có bài trong ván này."}</p>}
        {isNightReviewPhase && (
          <p>
            Xem lại kết quả hành động ban đêm của bạn. Khi tất cả người chơi hoàn tất, ván sẽ tự chuyển sang thảo luận.
          </p>
        )}
        {isDiscussionPhase && (
          <>
            <p>Thảo luận, thuyết phục và tìm Ma Sói. Timer đề xuất là 5 phút.</p>
            {discussionSecondsLeft !== null && (
              <strong className={styles.playTimer}>
                {Math.floor(discussionSecondsLeft / 60)}:{String(discussionSecondsLeft % 60).padStart(2, "0")}
              </strong>
            )}
          </>
        )}
        {isVotingPhase && <p>Chọn một người để bỏ phiếu treo.</p>}
      </section>

      {!isDiscussionPhase && (
        <section className={`${styles.playPanel} ${usesFocusedRevealLayout ? styles.focusedPlayPanel : ""}`}>
        {!hasFocusedWaitingStatus && playState.game.phase !== "result" && (
          <div>
            <span>Điều khiển phase</span>
            <h2>{WOLF_PHASE_LABELS[playState.game.phase]}</h2>
          </div>
        )}

        {isCardRevealPhase && (
          <>
            <div className={styles.privateRevealBox}>
              <RoleCard label="Bài của tôi" role={playState.myCard?.originalRole ?? null} />
              {renderPrivateCover()}
            </div>
          </>
        )}

        {playState.game.phase === "night" && renderNightActions()}

        {playState.game.phase === "night_review" && (
          <>
            <div className={styles.privateRevealBox}>
              <div className={styles.nightReviewContent}>
                {playState.nightReviewMessages.map((reviewMessage) => (
                  <p key={reviewMessage}>{reviewMessage}</p>
                ))}
              </div>
              {renderPrivateCover()}
            </div>
          </>
        )}

        {playState.game.phase === "voting" && (
          <>
            <div className={styles.playPicker}>
              <button
                className={activeVoteTargetPlayerId === VOTE_SKIP_KEY ? styles.playOptionActive : styles.playOption}
                type="button"
                disabled={isPending}
                onClick={() => votePlayer(null)}
              >
                Bỏ qua
              </button>
              {playState.players.map((player) => (
                <button
                  className={activeVoteTargetPlayerId === player.id ? styles.playOptionActive : styles.playOption}
                  key={player.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => votePlayer(player.id)}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </>
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
                  {getPlayerName(playState.players, voteCount.playerId)}: {voteCount.votes} phiếu
                </span>
              ))}
            </div>
          </>
        )}

        {message && <p className={styles.inlineError}>{message}</p>}

        </section>
      )}

      {isDiscussionPhase && roleDeckSummary.length > 0 && (
        <section className={styles.discussionRoleDeck}>
          <span>Vai trò trong ván</span>
          <div className={styles.roleDeckGrid}>
            {roleDeckSummary.map((roleSummary) => (
              <article
                key={roleSummary.role}
                className={`${styles.roleDeckTile} ${
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
        </section>
      )}

      {isCardRevealPhase && (
        <section className={styles.cardRevealActionBar}>
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

      {isNightPhase && !myActionSubmitted && myRole && (
        <section className={styles.cardRevealActionBar}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!canSubmitResolvedNightAction || isPending}
            onClick={submitNightAction}
          >
            <Check aria-hidden="true" />
            Hoàn tất lượt đêm
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
        <section className={styles.cardRevealActionBar}>
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
        className={`${styles.playWaitingStatus} ${hasFocusedWaitingStatus ? styles.focusedWaitingStatus : ""} ${playState.game.phase === "result" ? styles.playWaitingStatusResult : ""}`}
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
