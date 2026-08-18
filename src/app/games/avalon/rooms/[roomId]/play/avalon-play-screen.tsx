"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Crown,
  Eye,
  EyeOff,
  History,
  LoaderCircle,
  LogOut,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Target,
  Users,
  Vote,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent } from "react";
import {
  AVALON_ROLE_LABELS,
  getAvalonRoleImagePath,
  getAvalonQuestRequiredFails,
  getAvalonQuestTeamSize,
  type AvalonQuestCard,
  type AvalonTeamVote,
} from "@/lib/avalon-game";
import { getPlayerAvatarPath } from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import {
  confirmAvalonRoleReveal,
  continueAvalonTeamVote,
  finishAvalonGame,
  getAvalonPlayState,
  leaveAvalonRoom,
  proposeAvalonTeam,
  revealAvalonQuestCard,
  submitAvalonAssassination,
  submitAvalonLadyTarget,
  submitAvalonQuestCard,
  submitAvalonTeamVote,
  updateAvalonTeamDraft,
  type AvalonPlayPlayer,
  type AvalonPlayState,
} from "../../../actions";
import styles from "../../../../wolf/page.module.css";

const PRIVATE_CARD_COVER_IMAGE_PATH = "/images/ui/mask_card.png";
const PRIVATE_REVEAL_OPEN_DRAG_RATIO = 1 / 3;
const PRIVATE_REVEAL_CLOSE_DRAG_RATIO = 1 / 4;
const PRIVATE_REVEAL_DRAG_TAP_TOLERANCE = 6;

type AvalonPlayScreenProps = {
  initialState: AvalonPlayState;
  debugQuestOutcomes?: AvalonQuestCard[];
};

type AvalonSelectionState = {
  key: string;
  teamPlayerIds: string[];
  questIndex: number;
  ladyTargetId: string | null;
  assassinationTargetId: string | null;
};

type AvalonKnownPlayer = AvalonPlayState["privateInfo"]["knownPlayers"][number];

function getTeamLabel(team: AvalonPlayState["myLoyalty"]) {
  if (team === "good") {
    return "Good";
  }

  if (team === "evil") {
    return "Evil";
  }

  return "Không rõ";
}

function getPlayerName(players: AvalonPlayPlayer[], playerId: string | null) {
  return players.find((player) => player.id === playerId)?.name ?? "Không rõ";
}

export default function AvalonPlayScreen({ initialState, debugQuestOutcomes }: AvalonPlayScreenProps) {
  const router = useRouter();
  const [playState, setPlayState] = useState(initialState);
  const [selectionState, setSelectionState] = useState<AvalonSelectionState>(() => ({
    key: "",
    teamPlayerIds: initialState.selectedTeamPlayerIds,
    questIndex:
      initialState.game.proposedQuestIndex ?? initialState.availableQuestIndexes[0] ?? initialState.game.questIndex,
    ladyTargetId: null,
    assassinationTargetId: null,
  }));
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [unlockedPrivateRevealKey, setUnlockedPrivateRevealKey] = useState<string | null>(
    initialState.game.phase === "role_reveal" ? null : `${initialState.game.id}:${initialState.game.phase}`
  );
  const [hasViewedPrivateReveal, setHasViewedPrivateReveal] = useState(initialState.game.phase !== "role_reveal");
  const [coverPointerStartY, setCoverPointerStartY] = useState<number | null>(null);
  const [coverDragOffset, setCoverDragOffset] = useState(0);
  const [coverDragMode, setCoverDragMode] = useState<"opening" | "closing" | null>(null);
  const coverHasDraggedRef = useRef(false);
  const [isPrivateInfoOpen, setIsPrivateInfoOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [flippingCardKey, setFlippingCardKey] = useState<string | null>(null);
  const previousRevealRef = useRef<{ questIndex: number | null; revealedCount: number }>({
    questIndex: initialState.questReveal.questIndex,
    revealedCount: initialState.questReveal.revealedCount,
  });

  useEffect(() => {
    const questIndex = playState.questReveal.questIndex;
    const revealedCount = playState.questReveal.revealedCount;
    const previous = previousRevealRef.current;
    if (previous.questIndex === questIndex && revealedCount > previous.revealedCount) {
      setFlippingCardKey(`${questIndex}:${revealedCount - 1}`);
    }
    previousRevealRef.current = { questIndex, revealedCount };
  }, [playState.questReveal.questIndex, playState.questReveal.revealedCount]);

  useEffect(() => {
    if (!flippingCardKey) {
      return;
    }
    const timer = setTimeout(() => setFlippingCardKey(null), 900);
    return () => clearTimeout(timer);
  }, [flippingCardKey]);

  const currentPlayer = playState.players.find((player) => player.id === playState.currentPlayerId) ?? null;
  const isLeader = Boolean(currentPlayer && playState.leaderPlayerId === currentPlayer.id);
  const isRoleRevealPhase = playState.game.phase === "role_reveal";
  const isTeamProposalPhase = playState.game.phase === "team_proposal";
  const isTeamVotePhase = playState.game.phase === "team_vote";
  const isQuestPhase = playState.game.phase === "quest";
  const isQuestRevealPhase = playState.game.phase === "quest_reveal";
  const isLadyPhase = playState.game.phase === "lady";
  const isAssassinationPhase = playState.game.phase === "assassination";
  const isResultPhase = playState.game.phase === "result";
  const privateRevealKey = isRoleRevealPhase ? `${playState.game.id}:${playState.game.phase}` : null;
  const privateRevealUnlocked = privateRevealKey === null || unlockedPrivateRevealKey === privateRevealKey;
  const selectionKey = `${playState.game.id}:${playState.game.phase}:${playState.game.proposalAttempt}:${
    playState.game.proposedQuestIndex ?? ""
  }:${playState.selectedTeamPlayerIds.join(",")}:${playState.availableQuestIndexes.join(",")}`;
  const selectedTeamPlayerIds =
    selectionState.key === selectionKey ? selectionState.teamPlayerIds : playState.selectedTeamPlayerIds;
  const selectedQuestIndex =
    selectionState.key === selectionKey
      ? selectionState.questIndex
      : playState.game.proposedQuestIndex ?? playState.availableQuestIndexes[0] ?? playState.game.questIndex;
  const selectedLadyTargetId = selectionState.key === selectionKey ? selectionState.ladyTargetId : null;
  const selectedAssassinationTargetId =
    selectionState.key === selectionKey ? selectionState.assassinationTargetId : null;
  const currentQuestIndex =
    playState.questReveal.questIndex ?? playState.game.proposedQuestIndex ?? selectedQuestIndex ?? playState.game.questIndex;
  const currentQuestNumber = currentQuestIndex + 1;
  const currentQuestRequiredFails = getAvalonQuestRequiredFails(playState.players.length, currentQuestIndex);
  const requiredQuestSuccesses = Math.max(
    0,
    playState.selectedTeamPlayerIds.length - currentQuestRequiredFails + 1
  );
  const teamSubmittedQuestCards = playState.players.filter(
    (player) => player.isOnQuestTeam && player.hasQuestSubmitted
  ).length;
  const knownEvilIds = new Set(
    playState.privateInfo.knownPlayers
      .filter((knownPlayer) => knownPlayer.loyalty === "evil" || knownPlayer.note.includes("Evil"))
      .map((knownPlayer) => knownPlayer.playerId)
  );
  const assassinCandidates = playState.players.filter(
    (player) => player.id !== playState.currentPlayerId && !knownEvilIds.has(player.id)
  );
  const ladyTargets = playState.players.filter(
    (player) =>
      player.id !== playState.currentPlayerId && !playState.ladyOfLake.usedByPlayerIds.includes(player.id)
  );
  const approvedTeamVoters = playState.players.filter((player) => player.teamVote === "approve");
  const rejectedTeamVoters = playState.players.filter((player) => player.teamVote === "reject");
  const currentPlayerWonResult =
    playState.result && playState.myLoyalty ? playState.result.winnerTeam === playState.myLoyalty : null;

  function getPlayerAvatarKey(playerId: string) {
    return playState.players.find((player) => player.id === playerId)?.avatarKey;
  }

  function renderKnownPlayerChip(knownPlayer: AvalonKnownPlayer, showNote = false, concealLoyalty = false) {
    return (
      <span
        className={`${styles.avalonKnownPlayerChip} ${
          !concealLoyalty && knownPlayer.loyalty === "evil" ? styles.avalonKnownPlayerEvil : ""
        }`}
        key={`${knownPlayer.playerId}-${knownPlayer.note}`}
      >
        <Image
          alt=""
          aria-hidden="true"
          className={styles.avalonKnownPlayerAvatar}
          height={32}
          src={getPlayerAvatarPath(getPlayerAvatarKey(knownPlayer.playerId))}
          width={32}
        />
        <span className={styles.avalonKnownPlayerText}>
          <span className={styles.avalonKnownPlayerName}>{knownPlayer.playerName}</span>
          {showNote && knownPlayer.note ? (
            <span className={styles.avalonKnownPlayerNote}>{knownPlayer.note}</span>
          ) : null}
        </span>
      </span>
    );
  }

  const refreshPlayState = useCallback(async () => {
    const nextState = await getAvalonPlayState(playState.room.code);

    if (!nextState) {
      router.push(`/games/avalon/rooms/${playState.room.code}`);
      return;
    }

    setPlayState(nextState);
  }, [playState.room.code, router]);

  useWolfRoomPresence({
    enabled: Boolean(playState.currentPlayerId),
    roomCode: playState.room.code,
    onPlayUpdate: refreshPlayState,
    onRoomUpdate: refreshPlayState,
  });

  const questTrack = useMemo(
    () =>
      Array.from({ length: 5 }, (_, questIndex) => {
        const result = playState.questResults.find((questResult) => questResult.questIndex === questIndex);

        return {
          questIndex,
          result,
          teamSize: getAvalonQuestTeamSize(playState.players.length, questIndex),
          requiredFails: getAvalonQuestRequiredFails(playState.players.length, questIndex),
        };
      }),
    [playState.players.length, playState.questResults]
  );

  function runMutation(label: string, mutation: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setMessage("");
    setPendingLabel(label);
    startTransition(async () => {
      const result = await mutation();

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      await refreshPlayState();
      setPendingLabel("");
    });
  }

  function syncTeamDraft(teamPlayerIds: string[], questIndex: number) {
    if (!isLeader || !isTeamProposalPhase) {
      return;
    }

    void updateAvalonTeamDraft(playState.room.code, { playerIds: teamPlayerIds, questIndex }).then((result) => {
      if (!result.ok) {
        setMessage(result.error);
      }
    });
  }

  function toggleTeamPlayer(playerId: string) {
    if (!isLeader || !isTeamProposalPhase || isPending) {
      return;
    }

    const currentIds = selectionState.key === selectionKey ? selectionState.teamPlayerIds : playState.selectedTeamPlayerIds;
    let nextIds = currentIds;

    if (currentIds.includes(playerId)) {
      nextIds = currentIds.filter((currentId) => currentId !== playerId);
    } else if (currentIds.length < playState.requiredTeamSize) {
      nextIds = [...currentIds, playerId];
    }

    setSelectionState((currentSelection) => ({
      ...currentSelection,
      key: selectionKey,
      questIndex: selectedQuestIndex,
      teamPlayerIds: nextIds,
    }));
    syncTeamDraft(nextIds, selectedQuestIndex);
  }

  function proposeCurrentTeam() {
    if (selectedTeamPlayerIds.length !== playState.requiredTeamSize) {
      setMessage(`Quest ${currentQuestNumber} cần đúng ${playState.requiredTeamSize} người.`);
      return;
    }

    runMutation("Đang đề cử đội...", () =>
      proposeAvalonTeam(playState.room.code, {
        playerIds: selectedTeamPlayerIds,
        questIndex: selectedQuestIndex,
      })
    );
  }

  function voteTeam(vote: AvalonTeamVote) {
    runMutation("Đang gửi phiếu vote...", () => submitAvalonTeamVote(playState.room.code, vote));
  }

  function continueTeamVote() {
    runMutation("Đang chuyển phase...", () => continueAvalonTeamVote(playState.room.code));
  }

  function submitQuest(card: AvalonQuestCard) {
    runMutation("Đang gửi lá quest...", () => submitAvalonQuestCard(playState.room.code, card));
  }

  function revealQuestCard() {
    if (debugQuestOutcomes) {
      setPlayState((current) => {
        const total = current.questReveal.totalCount;
        const nextCount = Math.min(current.questReveal.revealedCount + 1, total);
        return {
          ...current,
          questReveal: {
            ...current.questReveal,
            revealedCount: nextCount,
            revealedCards: debugQuestOutcomes.slice(0, nextCount),
            isComplete: nextCount >= total,
          },
        };
      });
      return;
    }

    runMutation(
      playState.questReveal.isComplete ? "Đang chốt kết quả quest..." : "Đang mở lá quest...",
      () => revealAvalonQuestCard(playState.room.code)
    );
  }

  function submitLadyTarget() {
    if (!selectedLadyTargetId) {
      setMessage("Chọn một người để Lady of the Lake xem loyalty.");
      return;
    }

    runMutation("Đang dùng Lady of the Lake...", () =>
      submitAvalonLadyTarget(playState.room.code, selectedLadyTargetId)
    );
  }

  function submitAssassination() {
    if (!selectedAssassinationTargetId) {
      setMessage("Assassin cần chọn một mục tiêu.");
      return;
    }

    runMutation("Đang chốt mục tiêu Assassin...", () =>
      submitAvalonAssassination(playState.room.code, selectedAssassinationTargetId)
    );
  }

  function returnToLobby() {
    setIsResetConfirmOpen(false);
    runMutation("Đang quay lại phòng chờ...", async () => {
      const result = await finishAvalonGame(playState.room.code);

      if (result.ok) {
        router.push(`/games/avalon/rooms/${playState.room.code}`);
      }

      return result;
    });
  }

  function requestResetGame() {
    setIsResetConfirmOpen(true);
  }

  function exitGame() {
    runMutation("Đang thoát phòng...", async () => {
      const result = await leaveAvalonRoom(playState.room.code);

      if (result.ok) {
        router.push("/games/avalon");
      }

      return result;
    });
  }

  function openPrivateReveal() {
    if (!privateRevealKey) {
      return;
    }

    setUnlockedPrivateRevealKey(privateRevealKey);
    setHasViewedPrivateReveal(true);
    setCoverPointerStartY(null);
    setCoverDragOffset(0);
    setCoverDragMode(null);
  }

  function startPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    coverHasDraggedRef.current = false;
    setCoverPointerStartY(event.clientY);
    setCoverDragOffset(0);
    setCoverDragMode("opening");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY === null || coverDragMode !== "opening") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextOffset = Math.min(0, event.clientY - coverPointerStartY);
    const maxLift = event.currentTarget.offsetHeight;
    const liftedDistance = coverPointerStartY - event.clientY;

    if (Math.abs(event.clientY - coverPointerStartY) > PRIVATE_REVEAL_DRAG_TAP_TOLERANCE) {
      coverHasDraggedRef.current = true;
    }

    if (liftedDistance >= maxLift * PRIVATE_REVEAL_OPEN_DRAG_RATIO) {
      openPrivateReveal();
      return;
    }

    setCoverDragOffset(Math.max(nextOffset, -maxLift));
  }

  function endPrivateRevealGesture(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();

    if (coverPointerStartY !== null && coverDragMode === "opening") {
      const liftedDistance = coverPointerStartY - event.clientY;

      if (liftedDistance >= event.currentTarget.offsetHeight * PRIVATE_REVEAL_OPEN_DRAG_RATIO) {
        openPrivateReveal();
        return;
      }
    }

    setCoverPointerStartY(null);
    setCoverDragOffset(0);
    setCoverDragMode(null);
  }

  function startPrivateCoverCloseGesture(event: PointerEvent<HTMLDivElement>) {
    if (!privateRevealUnlocked || !privateRevealKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    coverHasDraggedRef.current = false;
    setCoverPointerStartY(event.clientY);
    setCoverDragOffset(0);
    setCoverDragMode("closing");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePrivateCoverCloseGesture(event: PointerEvent<HTMLDivElement>) {
    if (coverPointerStartY === null || coverDragMode !== "closing") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const droppedDistance = Math.max(0, event.clientY - coverPointerStartY);

    if (Math.abs(event.clientY - coverPointerStartY) > PRIVATE_REVEAL_DRAG_TAP_TOLERANCE) {
      coverHasDraggedRef.current = true;
    }

    if (droppedDistance >= event.currentTarget.offsetHeight * PRIVATE_REVEAL_CLOSE_DRAG_RATIO) {
      coverPrivateReveal();
      return;
    }

    setCoverDragOffset(droppedDistance);
  }

  function endPrivateCoverCloseGesture(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();

    if (coverPointerStartY !== null && coverDragMode === "closing") {
      const droppedDistance = event.clientY - coverPointerStartY;

      if (droppedDistance >= event.currentTarget.offsetHeight * PRIVATE_REVEAL_CLOSE_DRAG_RATIO) {
        coverPrivateReveal();
        return;
      }
    }

    setCoverPointerStartY(null);
    setCoverDragOffset(0);
    setCoverDragMode(null);
  }

  function coverPrivateReveal() {
    if (!privateRevealKey) {
      return;
    }

    setUnlockedPrivateRevealKey(null);
    setCoverPointerStartY(null);
    setCoverDragOffset(0);
    setCoverDragMode(null);
  }

  function getPrivateCoverTransform() {
    if (privateRevealUnlocked && coverDragMode === "closing") {
      return `translateY(calc(-100% + var(--private-reveal-peek-height) + ${coverDragOffset}px))`;
    }

    if (privateRevealUnlocked) {
      return "translateY(calc(-100% + var(--private-reveal-peek-height)))";
    }

    return `translateY(${coverDragOffset}px)`;
  }

  function renderPrivateCover() {
    return (
      <div
        aria-hidden={privateRevealUnlocked}
        className={`${styles.privateRevealCover} ${coverPointerStartY !== null ? styles.privateRevealCoverDragging : ""}`}
        style={{ transform: getPrivateCoverTransform() }}
        onClick={() => {
          if (coverHasDraggedRef.current) {
            coverHasDraggedRef.current = false;
            return;
          }

          openPrivateReveal();
        }}
        onPointerCancel={() => {
          setCoverPointerStartY(null);
          setCoverDragOffset(0);
          setCoverDragMode(null);
        }}
        onPointerDown={privateRevealUnlocked ? startPrivateCoverCloseGesture : startPrivateRevealGesture}
        onPointerMove={privateRevealUnlocked ? movePrivateCoverCloseGesture : movePrivateRevealGesture}
        onPointerUp={privateRevealUnlocked ? endPrivateCoverCloseGesture : endPrivateRevealGesture}
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
        <div aria-hidden="true" className={styles.privateRevealHandle}>
          {privateRevealUnlocked ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </div>
      </div>
    );
  }

  function renderQuestTrack() {
    return (
      <section className={styles.avalonQuestTrack} aria-label="Tiến độ quest">
        {questTrack.map(({ questIndex, result, teamSize, requiredFails }) => (
          <article
            className={`${styles.avalonQuestNode} ${
              result?.outcome === "success"
                ? styles.avalonQuestSuccess
                : result?.outcome === "fail"
                  ? styles.avalonQuestFail
                  : currentQuestIndex === questIndex && !isResultPhase
                    ? styles.avalonQuestCurrent
                    : ""
            }`}
            key={questIndex}
          >
            <strong>Q{questIndex + 1}</strong>
            <span>{teamSize} người</span>
            {requiredFails > 1 && <small>2 Fail</small>}
          </article>
        ))}
      </section>
    );
  }

  function renderPlayerButton(player: AvalonPlayPlayer, active: boolean, onClick: () => void, disabled = false) {
    return (
      <button
        className={`${styles.avalonPlayerButton} ${active ? styles.avalonPlayerButtonActive : ""}`}
        type="button"
        disabled={disabled || isPending}
        key={player.id}
        onClick={onClick}
      >
        <span className={styles.avalonPlayerAvatarFrame} aria-hidden="true">
          <Image
            alt=""
            className={styles.avalonPlayerAvatarImage}
            width={40}
            height={40}
            src={getPlayerAvatarPath(player.avatarKey)}
          />
        </span>
        <span className={styles.avalonPlayerName}>{player.name}</span>
        {active && <Check aria-hidden="true" />}
      </button>
    );
  }

  function renderPrivatePanel() {
    if (!currentPlayer) {
      return null;
    }

    const isEvil = playState.myLoyalty === "evil";

    return (
      <section className={`${styles.avalonPrivatePanel} ${isEvil ? styles.avalonPrivatePanelEvil : ""}`}>
        <div className={styles.avalonSectionTitle}>
          <Eye aria-hidden="true" />
          <span>Thông tin riêng</span>
        </div>
        <div className={`${styles.avalonRoleCard} ${isEvil ? styles.avalonRoleCardEvil : styles.avalonRoleCardGood}`}>
          <span>Vai của bạn</span>
          <strong>{playState.myRole ? AVALON_ROLE_LABELS[playState.myRole] : "Chưa rõ"}</strong>
          <p className={isEvil ? styles.avalonLoyaltyEvil : styles.avalonLoyaltyGood}>
            {getTeamLabel(playState.myLoyalty)}
          </p>
        </div>
        {playState.privateInfo.roleDescription && <p>{playState.privateInfo.roleDescription}</p>}
        {playState.privateInfo.knownPlayers.length > 0 && (
          <div className={styles.avalonKnownSection}>
            {isEvil && <strong className={styles.avalonKnownTitle}>Đồng đội Evil</strong>}
            <div className={styles.avalonInfoList}>
              {playState.privateInfo.knownPlayers.map((knownPlayer) => renderKnownPlayerChip(knownPlayer, true))}
            </div>
          </div>
        )}
        {playState.privateInfo.ladyInspections.length > 0 && (
          <div className={styles.avalonInfoList}>
            {playState.privateInfo.ladyInspections.map((inspection) => (
              <span key={`${inspection.questNumber}-${inspection.targetPlayerId}`}>
                Q{inspection.questNumber}: {inspection.targetName} là {getTeamLabel(inspection.loyalty)}
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderRoleRevealKnownInfo() {
    const knownPlayers = playState.privateInfo.knownPlayers;

    if (knownPlayers.length === 0) {
      return null;
    }

    if (playState.myRole === "percival") {
      return (
        <div className={styles.avalonRevealNotes}>
          <strong>Ghi chú</strong>
          <p>Thấy Merlin và Morgana, nhưng không biết ai là Morgana và ai là Merlin thật.</p>
          <div className={styles.avalonRevealNameList}>
            {knownPlayers.map((knownPlayer) => renderKnownPlayerChip(knownPlayer, false, true))}
          </div>
        </div>
      );
    }

    const isEvil = playState.myLoyalty === "evil";

    return (
      <div className={`${styles.avalonRevealNotes} ${isEvil ? styles.avalonRevealNotesEvil : ""}`}>
        <strong>{isEvil ? "Đồng đội Evil" : "Những người bên dưới là Evil"}</strong>
        <div className={styles.avalonRevealNameList}>
          {knownPlayers.map((knownPlayer) => renderKnownPlayerChip(knownPlayer))}
        </div>
      </div>
    );
  }

  function renderRoleReveal() {
    const hasConfirmed = Boolean(currentPlayer?.hasConfirmedRole);
    const isEvil = playState.myLoyalty === "evil";
    const roleRevealDescription =
      playState.myRole === "percival" && playState.privateInfo.knownPlayers.length > 0
        ? null
        : playState.privateInfo.roleDescription ?? "Chờ người chơi trong phòng xác nhận đã xem vai.";
    const roleImagePath = playState.myRole ? getAvalonRoleImagePath(playState.myRole) : null;

    return (
      <section className={`${styles.playPanel} ${styles.avalonRoleRevealPanel}`}>
        <div
          className={`${styles.privateRevealBox} ${styles.avalonRoleRevealBox}`}
          onPointerCancel={() => {
            if (coverDragMode === "closing") {
              setCoverPointerStartY(null);
              setCoverDragOffset(0);
              setCoverDragMode(null);
            }
          }}
          onPointerDown={privateRevealUnlocked ? startPrivateCoverCloseGesture : undefined}
          onPointerMove={privateRevealUnlocked ? movePrivateCoverCloseGesture : undefined}
          onPointerUp={privateRevealUnlocked ? endPrivateCoverCloseGesture : undefined}
        >
          <div className={`${styles.avalonPhaseHero} ${isEvil ? styles.avalonPhaseHeroEvil : ""}`}>
            {roleImagePath && (
              <Image
                alt={playState.myRole ? AVALON_ROLE_LABELS[playState.myRole] : ""}
                className={styles.avalonRoleRevealImage}
                height={290}
                priority
                src={roleImagePath}
                width={160}
              />
            )}
            <h2>{playState.myRole ? AVALON_ROLE_LABELS[playState.myRole] : "Người quan sát"}</h2>
            <strong className={isEvil ? styles.avalonLoyaltyEvil : styles.avalonLoyaltyGood}>
              {getTeamLabel(playState.myLoyalty)}
            </strong>
            {roleRevealDescription && <p>{roleRevealDescription}</p>}
            {renderRoleRevealKnownInfo()}
          </div>
          {currentPlayer && renderPrivateCover()}
        </div>
        {currentPlayer && (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isPending || hasConfirmed || !hasViewedPrivateReveal}
            onClick={() => runMutation("Đang xác nhận...", () => confirmAvalonRoleReveal(playState.room.code))}
          >
            <Check aria-hidden="true" />
            {hasConfirmed ? "Đã xác nhận" : "Tôi đã xem vai"}
          </button>
        )}
      </section>
    );
  }

  function renderTeamOrderStrip() {
    return (
      <div className={styles.avalonLeaderOrder} aria-label="Thứ tự leader">
        {playState.players.map((player) => {
          const isCurrentLeader = player.id === playState.leaderPlayerId;
          const isSelected = selectedTeamPlayerIds.includes(player.id);

          return (
            <button
              className={`${styles.avalonOrderPlayer} ${isCurrentLeader ? styles.avalonOrderPlayerLeader : ""} ${
                isSelected ? styles.avalonOrderPlayerSelected : ""
              }`}
              type="button"
              disabled={!isLeader || isPending}
              key={player.id}
              onClick={() => toggleTeamPlayer(player.id)}
            >
              <span className={styles.avalonOrderIdentity}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.avalonOrderAvatar}
                  height={32}
                  src={getPlayerAvatarPath(player.avatarKey)}
                  width={32}
                />
                <span className={styles.avalonOrderPlayerName}>{player.name}</span>
                {isCurrentLeader && <Crown aria-hidden="true" />}
              </span>
              {isSelected && <Check aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  }

  function renderTeamProposal() {
    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonPhaseSummary}>
          <strong>Quest {currentQuestNumber}</strong>
          <span>
            Chọn {playState.requiredTeamSize} người. Lượt đề cử {playState.game.proposalAttempt}/5.
          </span>
        </div>
        {renderTeamOrderStrip()}

        {isLeader ? (
          <>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending || selectedTeamPlayerIds.length !== playState.requiredTeamSize}
              onClick={proposeCurrentTeam}
            >
              <Users aria-hidden="true" />
              Đề cử đội
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Leader chọn đội quest.</p>
        )}
      </section>
    );
  }

  function renderTeamVote() {
    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Vote aria-hidden="true" />
          <span>Vote đội Quest {currentQuestNumber}</span>
        </div>
        <div className={styles.avalonSelectedTeam}>
          {playState.selectedTeamPlayerIds.map((playerId) => (
            <span key={playerId}>{getPlayerName(playState.players, playerId)}</span>
          ))}
        </div>
        {currentPlayer && !currentPlayer.hasTeamVoted && (
          <div className={styles.avalonVoteActions}>
            <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={() => voteTeam("approve")}>
              <ShieldCheck aria-hidden="true" />
              Approve
            </button>
            <button
              className={`${styles.secondaryButton} ${styles.avalonVoteRejectButton}`}
              type="button"
              disabled={isPending}
              onClick={() => voteTeam("reject")}
            >
              <ShieldX aria-hidden="true" />
              Reject
            </button>
          </div>
        )}
        {currentPlayer?.hasTeamVoted && !playState.isTeamVoteRevealed && (
          <p className={styles.avalonWaitingText}>Đã gửi phiếu. Chờ mọi người vote.</p>
        )}
        {playState.isTeamVoteRevealed && (
          <section className={styles.avalonVoteResultBlock} aria-label="Kết quả vote">
            <div className={styles.avalonVoteColumns}>
              <section className={styles.avalonVoteColumn}>
                <strong className={styles.avalonVoteApproveTitle}>Approve</strong>
                <div className={styles.avalonInfoList}>
                  {approvedTeamVoters.length > 0 ? (
                    approvedTeamVoters.map((player) => <span key={player.id}>{player.name}</span>)
                  ) : (
                    <span>Chưa có phiếu</span>
                  )}
                </div>
              </section>
              <section className={styles.avalonVoteColumn}>
                <strong className={styles.avalonVoteRejectTitle}>Reject</strong>
                <div className={styles.avalonInfoList}>
                  {rejectedTeamVoters.length > 0 ? (
                    rejectedTeamVoters.map((player) => <span key={player.id}>{player.name}</span>)
                  ) : (
                    <span>Chưa có phiếu</span>
                  )}
                </div>
              </section>
            </div>
          </section>
        )}
        {playState.isTeamVoteRevealed && isLeader && (
          <button className={styles.primaryButton} type="button" disabled={isPending} onClick={continueTeamVote}>
            <ArrowRight aria-hidden="true" />
            Tiếp tục
          </button>
        )}
        {playState.isTeamVoteRevealed && currentPlayer && !isLeader && (
          <p className={`${styles.avalonWaitingText} ${styles.avalonVoteContinueWaiting}`}>
            Đang chờ Leader tiếp tục.
          </p>
        )}
      </section>
    );
  }

  function renderQuest() {
    const canSubmitQuest = Boolean(currentPlayer?.isOnQuestTeam && !currentPlayer.hasQuestSubmitted);
    const canPlayFail = playState.myLoyalty === "evil";

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Target aria-hidden="true" />
          <span>Quest {currentQuestNumber}</span>
        </div>
        <div className={styles.avalonSelectedTeam}>
          {playState.selectedTeamPlayerIds.map((playerId) => (
            <span key={playerId}>{getPlayerName(playState.players, playerId)}</span>
          ))}
        </div>
        <div className={styles.avalonPhaseSummary}>
          <strong>Cần {requiredQuestSuccesses} Success để qua nhiệm vụ</strong>
          <span>
            {teamSubmittedQuestCards}/{playState.selectedTeamPlayerIds.length} lá đã được gửi.
          </span>
        </div>
        {canSubmitQuest ? (
          <div className={styles.avalonVoteActions}>
            <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={() => submitQuest("success")}>
              <Check aria-hidden="true" />
              Success
            </button>
            <button
              className={`${styles.secondaryButton} ${styles.avalonQuestFailButton}`}
              type="button"
              disabled={isPending || !canPlayFail}
              onClick={() => submitQuest("fail")}
            >
              <X aria-hidden="true" />
              Fail
            </button>
          </div>
        ) : (
          <p className={styles.avalonWaitingText}>
            {currentPlayer?.isOnQuestTeam ? "Bạn đã gửi lá quest." : "Chờ đội quest chọn Success hoặc Fail."}
          </p>
        )}
      </section>
    );
  }

  function renderQuestReveal() {
    const totalCards = playState.questReveal.totalCount;
    const revealedCards = playState.questReveal.revealedCards;

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Eye aria-hidden="true" />
          <span>Mở bài Quest {currentQuestNumber}</span>
        </div>
        <div className={styles.avalonRevealDivider} aria-hidden="true">
          <span className={styles.avalonRevealDividerGem} />
        </div>
        <div className={styles.avalonRevealHeading}>
          <strong>
            Đã mở {playState.questReveal.revealedCount}/{totalCards} lá
          </strong>
          <span>Thứ tự lá đã được xáo trộn trước khi mở.</span>
        </div>
        <div className={styles.avalonQuestRevealCards}>
          {Array.from({ length: totalCards }, (_, cardIndex) => {
            const card = revealedCards[cardIndex] ?? null;
            const isRevealed = card !== null;
            const isFlipping = flippingCardKey === `${playState.questReveal.questIndex}:${cardIndex}`;

            return (
              <article className={styles.avalonQuestRevealCard} key={cardIndex}>
                <div
                  className={`${styles.avalonQuestRevealInner} ${
                    isRevealed ? styles.avalonQuestRevealInnerRevealed : ""
                  } ${isFlipping ? styles.avalonQuestRevealInnerFlipping : ""}`}
                >
                  <div className={`${styles.avalonQuestRevealFace} ${styles.avalonQuestRevealFront}`} />
                  <div
                    className={`${styles.avalonQuestRevealFace} ${styles.avalonQuestRevealBack} ${
                      card === "success"
                        ? styles.avalonQuestRevealCardSuccess
                        : card === "fail"
                          ? styles.avalonQuestRevealCardFail
                          : ""
                    }`}
                  >
                    {card === "success" ? (
                      <>
                        <span className={styles.avalonQuestRevealBadge}>
                          <Check aria-hidden="true" />
                        </span>
                        <strong>Success</strong>
                      </>
                    ) : card === "fail" ? (
                      <>
                        <span className={styles.avalonQuestRevealBadge}>
                          <X aria-hidden="true" />
                        </span>
                        <strong>Fail</strong>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {isLeader ? (
          <button className={styles.primaryButton} type="button" disabled={isPending} onClick={revealQuestCard}>
            <Eye aria-hidden="true" />
            {playState.questReveal.isComplete ? "Tiếp tục" : "Mở lá tiếp theo"}
          </button>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Leader {playState.leaderName} mở bài quest.</p>
        )}
      </section>
    );
  }

  function renderLady() {
    const isHolder = currentPlayer?.id === playState.ladyOfLake.holderPlayerId;

    return (
      <section className={styles.playPanel}>
        <div className={styles.avalonSectionTitle}>
          <Eye aria-hidden="true" />
          <span>Lady of the Lake</span>
        </div>
        <p className={styles.avalonWaitingText}>
          Người giữ token: {playState.ladyOfLake.holderName}. Lady xem loyalty, sau đó token chuyển cho người bị xem.
        </p>
        {isHolder ? (
          <>
            <div className={styles.avalonPlayerGrid}>
              {ladyTargets.map((player) =>
                renderPlayerButton(
                  player,
                  selectedLadyTargetId === player.id,
                  () =>
                    setSelectionState((currentSelection) => ({
                      ...currentSelection,
                      key: selectionKey,
                      questIndex: selectedQuestIndex,
                      teamPlayerIds: selectedTeamPlayerIds,
                      ladyTargetId: player.id,
                    }))
                )
              )}
            </div>
            <button className={styles.primaryButton} type="button" disabled={isPending || !selectedLadyTargetId} onClick={submitLadyTarget}>
              <Eye aria-hidden="true" />
              Xem loyalty
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Lady chọn mục tiêu.</p>
        )}
      </section>
    );
  }

  function renderAssassination() {
    const isAssassin = playState.myRole === "assassin";

    return (
      <section className={`${styles.playPanel} ${styles.avalonAssassinationPanel}`}>
        <div className={styles.avalonSectionTitle}>
          <Target aria-hidden="true" />
          <span>Assassin đoán Merlin</span>
        </div>
        <p className={styles.avalonWaitingText}>
          Good đã hoàn thành 3 quest. Evil có một cơ hội cuối để đoán Merlin.
        </p>
        {isAssassin ? (
          <>
            <div className={styles.avalonPlayerGrid}>
              {assassinCandidates.map((player) =>
                renderPlayerButton(
                  player,
                  selectedAssassinationTargetId === player.id,
                  () =>
                    setSelectionState((currentSelection) => ({
                      ...currentSelection,
                      key: selectionKey,
                      questIndex: selectedQuestIndex,
                      teamPlayerIds: selectedTeamPlayerIds,
                      assassinationTargetId: player.id,
                    }))
                )
              )}
            </div>
            <button
              className={styles.exitButton}
              type="button"
              disabled={isPending || !selectedAssassinationTargetId}
              onClick={submitAssassination}
            >
              <Target aria-hidden="true" />
              Chốt mục tiêu
            </button>
          </>
        ) : (
          <p className={styles.avalonWaitingText}>Đang chờ Assassin chốt mục tiêu Merlin.</p>
        )}
      </section>
    );
  }

  function renderResult() {
    return (
      <section className={styles.playPanel}>
        {playState.result && (
          <strong
            className={`${styles.resultBanner} ${
              currentPlayerWonResult === false ? styles.resultBannerDanger : ""
            }`}
          >
            {playState.result.winnerText}
          </strong>
        )}
        {playState.result && <p className={styles.avalonWaitingText}>{playState.result.winnerReason}</p>}

        <div className={styles.avalonResultList}>
          {playState.players.map((player) => {
            const isEvil = player.loyalty === "evil";

            return (
              <div className={styles.avalonResultRow} key={player.id}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.avalonResultAvatar}
                  height={36}
                  src={getPlayerAvatarPath(player.avatarKey)}
                  width={36}
                />
                <div className={styles.avalonResultPlayer}>
                  <strong>{player.name}</strong>
                  <span className={isEvil ? styles.avalonLoyaltyEvil : styles.avalonLoyaltyGood}>
                    {getTeamLabel(player.loyalty)}
                  </span>
                </div>
                <strong className={`${styles.avalonResultRole} ${isEvil ? styles.avalonResultRoleEvil : ""}`}>
                  {player.role ? AVALON_ROLE_LABELS[player.role] : "Không rõ"}
                </strong>
              </div>
            );
          })}
        </div>

        {playState.assassination.targetPlayerId && (
          <div className={styles.avalonVoteReview}>
            <strong>Assassin chọn {getPlayerName(playState.players, playState.assassination.targetPlayerId)}</strong>
            <span>{playState.assassination.guessedCorrect ? "Đoán đúng Merlin" : "Đoán sai Merlin"}</span>
          </div>
        )}
      </section>
    );
  }

  function renderPhasePanel() {
    if (isRoleRevealPhase) {
      return renderRoleReveal();
    }

    if (isTeamProposalPhase) {
      return renderTeamProposal();
    }

    if (isTeamVotePhase) {
      return renderTeamVote();
    }

    if (isQuestPhase) {
      return renderQuest();
    }

    if (isQuestRevealPhase) {
      return renderQuestReveal();
    }

    if (isLadyPhase) {
      return renderLady();
    }

    if (isAssassinationPhase) {
      return renderAssassination();
    }

    return renderResult();
  }

  return (
    <main className={`${styles.page} ${styles.playPage} ${styles.avalonTheme}`}>
      <section
        className={`${styles.playHeader} ${isResultPhase ? styles.resultHeader : ""} ${
          isRoleRevealPhase ? styles.avalonRoleRevealHeader : ""
        }`}
      >
        <div>
          <span>Phòng {playState.room.code.toUpperCase()}</span>
          <h1>{playState.game.phaseLabel}</h1>
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
        {currentPlayer && isRoleRevealPhase && (
          privateRevealUnlocked ? (
            <button
              aria-label="Che lại vai"
              className={`${styles.avalonRoleRevealToggleButton} ${styles.avalonRoleCoverButton}`}
              title="Che lại"
              type="button"
              onClick={coverPrivateReveal}
            >
              <EyeOff aria-hidden="true" />
            </button>
          ) : (
            <button
              aria-label="Mở vai"
              className={`${styles.avalonRoleRevealToggleButton} ${styles.avalonRoleOpenButton}`}
              title="Mở vai"
              type="button"
              onClick={openPrivateReveal}
            >
              <Eye aria-hidden="true" />
            </button>
          )
        )}
        {!isRoleRevealPhase && (
          <div className={styles.avalonHeaderActions}>
            <p className={styles.avalonScoreSummary}>
              <span className={styles.avalonScoreGood}>Success {playState.successCount}/3</span>
              <span aria-hidden="true" className={styles.avalonScoreDivider}>
                &middot;
              </span>
              <span className={styles.avalonScoreEvil}>Fail {playState.failCount}/3</span>
              {!isTeamProposalPhase && (
                <>
                  <span aria-hidden="true" className={styles.avalonScoreDivider}>
                    &middot;
                  </span>
                  <span className={styles.avalonScoreLeader}>Leader {playState.leaderName}</span>
                </>
              )}
            </p>
            {currentPlayer && (
              <button
                aria-label="Xem thông tin riêng"
                className={styles.avalonPrivateInfoButton}
                title="Thông tin riêng"
                type="button"
                onClick={() => setIsPrivateInfoOpen(true)}
              >
                <Eye aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      {!isRoleRevealPhase && renderQuestTrack()}

      <section
        className={`${styles.avalonBoardLayout} ${isRoleRevealPhase ? styles.avalonBoardLayoutRoleReveal : ""}`}
      >
        <div className={styles.avalonMainColumn}>
          {renderPhasePanel()}

          {message && <p className={styles.inlineError}>{message}</p>}

          {playState.questResults.length > 0 && (
            <section className={styles.avalonHistoryPanel}>
              <div className={styles.avalonSectionTitle}>
                <History aria-hidden="true" />
                <span>Lịch sử quest</span>
              </div>
              <div className={styles.avalonInfoList}>
                {playState.questResults.map((questResult) => (
                  <span key={`${questResult.questIndex}-${questResult.proposalAttempt}`}>
                    Q{questResult.questNumber}: {questResult.outcome === "success" ? "Success" : "Fail"} ·{" "}
                    {questResult.failCount} Fail · Đội {questResult.teamNames.join(", ")}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

      </section>

      {isPrivateInfoOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-label="Thông tin riêng Avalon"
            aria-modal="true"
            className={`${styles.modal} ${styles.avalonPrivateInfoModal}`}
            role="dialog"
          >
            <button
              aria-label="Đóng thông tin riêng"
              className={styles.closeButton}
              type="button"
              onClick={() => setIsPrivateInfoOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            {renderPrivatePanel()}
          </section>
        </div>
      )}

      {isResetConfirmOpen && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setIsResetConfirmOpen(false)}>
          <section
            aria-labelledby="reset-game-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Đóng xác nhận reset"
              className={styles.closeButton}
              type="button"
              onClick={() => setIsResetConfirmOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="reset-game-title">Reset game?</h2>
            <p>Đưa tất cả người chơi về phòng chờ. Mọi người sẽ phải bấm sẵn sàng lại từ đầu.</p>
            <div className={styles.identityActions}>
              <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={() => setIsResetConfirmOpen(false)}>
                Ở lại
              </button>
              <button className={styles.exitButton} type="button" disabled={isPending} onClick={returnToLobby}>
                <RotateCcw aria-hidden="true" />
                Reset game
              </button>
            </div>
          </section>
        </div>
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
    </main>
  );
}
