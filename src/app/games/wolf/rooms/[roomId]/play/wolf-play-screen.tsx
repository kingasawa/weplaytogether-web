"use client";

import { Check, ChevronUp, LoaderCircle, LogOut, RefreshCw, Shield, Vote } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type PointerEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
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
  const activeVoteTargetPlayerId = optimisticVoteTargetPlayerId ?? playState.myVoteTargetPlayerId;
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

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`wolf-play:${playState.game.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_game_sessions",
          filter: `id=eq.${playState.game.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_game_phase_confirmations",
          filter: `game_id=eq.${playState.game.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_game_actions",
          filter: `game_id=eq.${playState.game.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_game_votes",
          filter: `game_id=eq.${playState.game.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_game_cards",
          filter: `game_id=eq.${playState.game.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_rooms",
          filter: `id=eq.${playState.room.id}`,
        },
        () => {
          void refreshPlayState();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [playState.game.id, playState.room.id, refreshPlayState, supabase]);

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

      setMessage("Đã lưu hành động ban đêm.");
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

  function votePlayer(playerId: string) {
    setMessage("");
    setOptimisticVoteTargetPlayerId(playerId);
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
    setMaskDragOffset(Math.max(nextOffset, -220));
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
    const canSubmit =
      myRole === "villager" ||
      myRole === "insomniac" ||
      (myRole === "werewolf" && selectedCenterIndexes.length <= 1) ||
      (myRole === "robber" && selectedPlayerIds.length === 1) ||
      (myRole === "troublemaker" && selectedPlayerIds.length === 2) ||
      (myRole === "drunk" && selectedCenterIndexes.length === 1) ||
      (myRole === "seer" && (selectedPlayerIds.length === 1 || selectedCenterIndexes.length === 2));

    return (
      <>
        <p>{WOLF_ROLE_DESCRIPTIONS[myRole]}</p>

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

        <button className={styles.primaryButton} type="button" disabled={!canSubmit || isPending} onClick={submitNightAction}>
          <Check aria-hidden="true" />
          Hoàn tất lượt đêm
        </button>
      </>
    );
  }

  return (
    <main className={`${styles.page} ${styles.playPage}`}>
      <section className={styles.playHeader}>
        <div>
          <span>Phòng {playState.room.code.toUpperCase()}</span>
          <h1>{WOLF_PHASE_LABELS[playState.game.phase]}</h1>
        </div>
        <button className={styles.smallButton} type="button" disabled={isPending} onClick={() => void refreshPlayState()}>
          <RefreshCw aria-hidden="true" />
          Đồng bộ
        </button>
      </section>

      <section className={styles.playPanel}>
        <div>
          <span>Điều khiển phase</span>
          <h2>{WOLF_PHASE_LABELS[playState.game.phase]}</h2>
        </div>

        {playState.game.phase === "card_reveal" && (
          <>
            <p>Xem kỹ lá bài của bạn. Khi tất cả người chơi bấm OK, ván sẽ tự chuyển sang giai đoạn thực hiện chức năng ban đêm.</p>
            <div className={styles.privateRevealBox}>
              <RoleCard label="Bài của tôi" role={playState.myCard?.originalRole ?? null} />
              {renderPrivateMask("Bài của bạn")}
            </div>
            {!privateRevealUnlocked && <p>Vuốt lớp bảo vệ trên lá bài lên trước khi bấm OK.</p>}
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending || playState.isCurrentPlayerPhaseReady || !privateRevealUnlocked}
              onClick={() => confirmCurrentPhase("Đang xác nhận đã xem bài...")}
            >
              <Check aria-hidden="true" />
              {playState.isCurrentPlayerPhaseReady ? "Đã OK" : "OK, tôi đã xem bài"}
            </button>
          </>
        )}

        {playState.game.phase === "night" && renderNightActions()}

        {playState.game.phase === "night_review" && (
          <>
            <p>Xem lại kết quả hành động ban đêm của bạn. Khi tất cả người chơi hoàn tất, ván sẽ tự chuyển sang thảo luận.</p>
            <div className={styles.privateRevealBox}>
              {playState.nightReviewMessages.map((reviewMessage) => (
                <p key={reviewMessage}>{reviewMessage}</p>
              ))}
              {playState.myCard?.currentRole && playState.myCard.currentRole !== playState.myCard.originalRole && (
                <p>Hiện tại bạn đang là {WOLF_ROLE_LABELS[playState.myCard.currentRole]}.</p>
              )}
              {renderPrivateMask("Kết quả ban đêm")}
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending || playState.isCurrentPlayerPhaseReady || !privateRevealUnlocked}
              onClick={() => confirmCurrentPhase("Đang xác nhận đã xem lại...")}
            >
              <Check aria-hidden="true" />
              {playState.isCurrentPlayerPhaseReady ? "Đã xong" : "Xong, vào thảo luận"}
            </button>
          </>
        )}

        {playState.game.phase === "discussion" && (
          <>
            <p>Thảo luận, thuyết phục và tìm Ma Sói. Timer đề xuất là 5 phút.</p>
            {discussionSecondsLeft !== null && (
              <strong className={styles.playTimer}>
                {Math.floor(discussionSecondsLeft / 60)}:{String(discussionSecondsLeft % 60).padStart(2, "0")}
              </strong>
            )}
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending || playState.isCurrentPlayerPhaseReady}
              onClick={() => confirmCurrentPhase("Đang xác nhận thảo luận xong...")}
            >
              <Check aria-hidden="true" />
              {playState.isCurrentPlayerPhaseReady ? "Đã sẵn sàng vote" : "Tôi đã thảo luận xong"}
            </button>
          </>
        )}

        {playState.game.phase === "voting" && (
          <>
            <p>Chọn một người để bỏ phiếu treo.</p>
            <div className={styles.playPicker}>
              {playState.players.map((player) => (
                <button
                  className={activeVoteTargetPlayerId === player.id ? styles.playOptionActive : styles.playOption}
                  key={player.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => votePlayer(player.id)}
                >
                  <Vote aria-hidden="true" />
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
              {playState.result.voteCounts.map((voteCount) => (
                <span className={styles.voteResult} key={voteCount.playerId}>
                  {getPlayerName(playState.players, voteCount.playerId)}: {voteCount.votes} phiếu
                </span>
              ))}
            </div>
          </>
        )}

        {message && <p className={styles.inlineError}>{message}</p>}

        {playState.isCurrentPlayerHost && playState.game.phase === "result" && (
          <button className={styles.primaryButton} type="button" disabled={isPending} onClick={returnToLobby}>
            <LogOut aria-hidden="true" />
            Về phòng chờ
          </button>
        )}
      </section>

      <section className={styles.playPlayers}>
        <h2>Người chơi</h2>
        {playState.players.map((player) => (
          <article className={styles.playerRow} key={player.id}>
            <div>
              <strong>{player.name}</strong>
              <span>
                {playState.game.phase === "card_reveal" && (player.isPhaseReady ? "Đã xem bài" : "Đang xem bài")}
                {playState.game.phase === "night" && (player.hasNightAction ? "Đã xong lượt đêm" : "Chưa xong lượt đêm")}
                {playState.game.phase === "night_review" && (player.isPhaseReady ? "Đã xem lại" : "Đang xem lại")}
                {playState.game.phase === "voting" && (player.hasVoted ? "Đã vote" : "Chưa vote")}
                {playState.game.phase === "result" && player.role && WOLF_ROLE_LABELS[player.role]}
                {playState.game.phase === "discussion" && (player.isPhaseReady ? "Đã sẵn sàng vote" : "Đang thảo luận")}
              </span>
            </div>
            {player.isHost && <span className={styles.hostBadge}>Chủ phòng</span>}
          </article>
        ))}
      </section>

      {isPending && (
        <div className={styles.playLoading} aria-live="polite">
          <LoaderCircle aria-hidden="true" />
          <span>{pendingLabel || "Đang xử lý..."}</span>
        </div>
      )}
    </main>
  );
}
