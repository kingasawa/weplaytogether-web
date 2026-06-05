"use client";

import { Check, ChevronUp, LoaderCircle, LogOut, Shield } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type PointerEvent } from "react";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import type { WolfRole } from "@/lib/supabase/types";
import {
  getWolfRoleImagePath,
  WOLF_PHASE_LABELS,
  WOLF_ROLE_DESCRIPTIONS,
  WOLF_ROLE_LABELS,
} from "@/lib/wolf-game";
import {
  finishWolfGame,
  getWolfPlayState,
  submitWolfPhaseConfirmation,
  submitWolfNightAction,
  submitWolfVote,
  type WolfPlayPlayer,
  type WolfPlayState,
} from "../../../actions";
import styles from "../../../page.module.css";

type WolfPlayScreenProps = {
  initialState: WolfPlayState;
};

const VOTE_SKIP_KEY = "__skip_vote__";

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

export default function WolfPlayScreen({ initialState }: WolfPlayScreenProps) {
  const router = useRouter();
  const [playState, setPlayState] = useState(initialState);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedCenterIndexes, setSelectedCenterIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pendingLabel, setPendingLabel] = useState("");
  const [optimisticVoteTargetPlayerId, setOptimisticVoteTargetPlayerId] = useState<string | null>(null);
  const [unlockedPrivateRevealKey, setUnlockedPrivateRevealKey] = useState<string | null>(
    isPrivateRevealPhase(initialState.game.phase) ? null : `${initialState.game.id}:${initialState.game.phase}`
  );
  const [maskPointerStartY, setMaskPointerStartY] = useState<number | null>(null);
  const [maskDragOffset, setMaskDragOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  const myRole = playState.myCard?.originalRole ?? null;
  const otherPlayers = playState.players.filter((player) => player.id !== playState.currentPlayerId);
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

  function togglePlayerSelection(playerId: string) {
    setMessage("");
    setSelectedCenterIndexes([]);
    setSelectedPlayerIds((current) => {
      if (myRole === "troublemaker") {
        if (current.includes(playerId)) {
          return current.filter((id) => id !== playerId);
        }

        return [...current, playerId].slice(-2);
      }

      return current.includes(playerId) ? [] : [playerId];
    });
  }

  function toggleCenterSelection(centerIndex: number) {
    setMessage("");
    setSelectedPlayerIds([]);
    setSelectedCenterIndexes((current) => {
      if (current.includes(centerIndex)) {
        return current.filter((index) => index !== centerIndex);
      }

      if (myRole === "seer") {
        return [...current, centerIndex].slice(-2);
      }

      return [centerIndex];
    });
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
        targetCenterIndex: selectedCenterIndexes[0] ?? null,
        targetCenterIndex2: selectedCenterIndexes[1] ?? null,
      });

      if (!result.ok) {
        setMessage(result.error);
        setPendingLabel("");
        return;
      }

      setMessage("");
      setSelectedPlayerIds([]);
      setSelectedCenterIndexes([]);
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

  function startPrivateRevealGesture(event: PointerEvent<HTMLButtonElement>) {
    setMaskPointerStartY(event.clientY);
    setMaskDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePrivateRevealGesture(event: PointerEvent<HTMLButtonElement>) {
    if (maskPointerStartY === null) {
      return;
    }

    const nextOffset = Math.min(0, event.clientY - maskPointerStartY);
    const maxLift = event.currentTarget.offsetHeight;
    if (maskPointerStartY - event.clientY >= 44 && privateRevealKey) {
      setUnlockedPrivateRevealKey(privateRevealKey);
    }

    setMaskDragOffset(Math.max(nextOffset, -maxLift));
  }

  function endPrivateRevealGesture(event: PointerEvent<HTMLButtonElement>) {
    if (maskPointerStartY !== null && maskPointerStartY - event.clientY >= 44) {
      setUnlockedPrivateRevealKey(privateRevealKey);
    }

    setMaskPointerStartY(null);
    setMaskDragOffset(0);
  }

  function renderPrivateMask(label: string) {
    return (
      <button
        aria-label="Vuốt lớp bảo vệ lên để xem nội dung riêng tư"
        className={`${styles.privateRevealMask} ${maskPointerStartY !== null ? styles.privateRevealMaskDragging : ""}`}
        style={{ transform: `translateY(${maskDragOffset}px)` }}
        type="button"
        onClick={(event) => event.preventDefault()}
        onPointerCancel={() => {
          setMaskPointerStartY(null);
          setMaskDragOffset(0);
        }}
        onPointerDown={startPrivateRevealGesture}
        onPointerMove={movePrivateRevealGesture}
        onPointerUp={endPrivateRevealGesture}
      >
        <Shield aria-hidden="true" />
        <strong>{label}</strong>
        <span>Vuốt lớp bảo vệ lên để xem</span>
        <ChevronUp aria-hidden="true" />
      </button>
    );
  }

  function renderNightActions() {
    if (!myRole) {
      return <p>Bạn chưa có bài trong ván này.</p>;
    }

    if (myActionSubmitted) {
      return <p>Hành động của bạn đã được lưu. Chờ các người chơi khác hoàn tất.</p>;
    }

    const needsPlayerPicker = myRole === "seer" || myRole === "robber" || myRole === "troublemaker";
    const needsCenterPicker = myRole === "seer" || myRole === "drunk" || myRole === "werewolf";
    return (
      <>
        {needsPlayerPicker && (
          <div className={styles.playPicker}>
            <span>Chọn người chơi</span>
            {otherPlayers.map((player) => (
              <button
                className={selectedPlayerIds.includes(player.id) ? styles.playOptionActive : styles.playOption}
                key={player.id}
                type="button"
                onClick={() => togglePlayerSelection(player.id)}
              >
                {player.name}
              </button>
            ))}
          </div>
        )}

        {needsCenterPicker && (
          <div className={styles.playPicker}>
            <span>Chọn lá giữa bàn</span>
            {playState.centerCards.map((card) => (
              <button
                className={selectedCenterIndexes.includes(card.index) ? styles.playOptionActive : styles.playOption}
                key={card.index}
                type="button"
                onClick={() => toggleCenterSelection(card.index)}
              >
                Lá {card.index + 1}
              </button>
            ))}
          </div>
        )}

      </>
    );
  }

  const canSubmitNightAction =
    myRole === "villager" ||
    myRole === "insomniac" ||
    (myRole === "werewolf" && selectedCenterIndexes.length <= 1) ||
    (myRole === "robber" && selectedPlayerIds.length === 1) ||
    (myRole === "troublemaker" && selectedPlayerIds.length === 2) ||
    (myRole === "drunk" && selectedCenterIndexes.length === 1) ||
    (myRole === "seer" && (selectedPlayerIds.length === 1 || selectedCenterIndexes.length === 2));

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
              {renderPrivateMask("Bài của bạn")}
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
              {renderPrivateMask("Kết quả ban đêm")}
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
            <strong className={styles.resultBanner}>{playState.result.winnerText}</strong>
            <div className={styles.playPicker}>
              {playState.result.skippedVoteCount > 0 && (
                <span className={styles.voteResult}>
                  Bỏ qua: {playState.result.skippedVoteCount} lượt
                </span>
              )}
              {playState.result.voteCounts.map((voteCount) => (
                <span className={styles.voteResult} key={voteCount.playerId}>
                  {getPlayerName(playState.players, voteCount.playerId)}: {voteCount.votes} phiếu
                </span>
              ))}
            </div>
          </>
        )}

        {message && <p className={styles.inlineError}>{message}</p>}

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
            disabled={!canSubmitNightAction || isPending}
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
                <div className={styles.resultMovementIntro}>
                  <strong>Thứ tự luân chuyển lá bài</strong>
                  <p>{playState.cardMovementSummary.orderText}</p>
                </div>

                {playState.cardMovementSummary.steps.length > 0 ? (
                  <div className={styles.resultMovementList}>
                    {playState.cardMovementSummary.steps.map((step) => (
                      <div className={styles.resultMovementStep} key={step.id}>
                        <strong>{step.title}</strong>
                        <p>{step.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.resultMovementEmpty}>Không có lá nào đổi chỗ trong đêm này.</p>
                )}
              </section>
            )}

            <div className={styles.resultSummaryList}>
              {playState.allPlayersSummary.map((summary) => (
                <div className={styles.resultSummaryRow} key={summary.playerId}>
                  <div className={styles.resultSummaryHeader}>
                    <strong>{summary.playerName}</strong>
                    <span className={styles.resultRoleTag}>
                      {WOLF_ROLE_LABELS[summary.originalRole]}
                      {summary.finalRole !== summary.originalRole && (
                        <> → {WOLF_ROLE_LABELS[summary.finalRole]}</>
                      )}
                    </span>
                  </div>
                  {summary.nightMessages.map((msg) => (
                    <p key={msg} className={styles.resultNightMessage}>{msg}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span>{getWaitingStatusText()}</span>
        )}
      </section>

      {playState.isCurrentPlayerHost && playState.game.phase === "result" && (
        <section className={styles.cardRevealActionBar}>
          <button className={styles.primaryButton} type="button" disabled={isPending} onClick={returnToLobby}>
            <LogOut aria-hidden="true" />
            Về phòng chờ
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
