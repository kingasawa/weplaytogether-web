"use client";

import { LoaderCircle, Trophy, UserPlus, Users } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerName,
} from "@/lib/guest-player";
import { getPlayerAvatarPath } from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import { WOLF_PHASE_LABELS } from "@/lib/wolf-game";
import {
  getWolfSpectatorState,
  joinWolfRoom,
  type WolfSpectatorState,
} from "../../actions";
import styles from "../../page.module.css";

type WolfRoomSpectatorProps = {
  initialState: WolfSpectatorState;
};

export default function WolfRoomSpectator({ initialState }: WolfRoomSpectatorProps) {
  const router = useRouter();
  const [spectatorState, setSpectatorState] = useState(initialState);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const refreshSpectatorState = useCallback(async () => {
    const nextState = await getWolfSpectatorState(spectatorState.room.code);

    if (nextState) {
      setSpectatorState(nextState);
    }
  }, [spectatorState.room.code]);

  useWolfRoomPresence({
    enabled: true,
    mode: "public",
    roomCode: spectatorState.room.code,
    onPlayUpdate: refreshSpectatorState,
    onRoomUpdate: refreshSpectatorState,
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSpectatorState();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSpectatorState]);

  function joinNextGame() {
    setMessage("");
    startTransition(async () => {
      const result = await joinWolfRoom(
        spectatorState.room.code,
        readStoredGuestPlayerName() || undefined,
        readStoredGuestPlayerAvatarKey()
      );

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}`);
      router.refresh();
    });
  }

  const phaseLabel = spectatorState.game
    ? WOLF_PHASE_LABELS[spectatorState.game.phase]
    : "Phòng chờ";
  const canJoinNow =
    spectatorState.room.status === "waiting" || spectatorState.game?.phase === "result";

  return (
    <main className={`${styles.page} ${styles.spectatorPage} ${styles.classicWolfTheme}`}>
      <section className={styles.spectatorPanel}>
        <p className={styles.eyebrow}>Theo dõi ván đang chơi</p>
        <div className={styles.spectatorHero}>
          <span>Phòng {spectatorState.room.code.toUpperCase()}</span>
          <h1>{phaseLabel}</h1>
          <p>
            Bạn đang xem trạng thái công khai của ván này. Role và thông tin bài
            riêng tư của người chơi sẽ không được hiển thị.
          </p>
        </div>

        <div className={styles.spectatorStatusGrid}>
          <article>
            <Users aria-hidden="true" />
            <span>Người chơi</span>
            <strong>{spectatorState.players.length}/10</strong>
          </article>
          <article>
            <Trophy aria-hidden="true" />
            <span>Phase hiện tại</span>
            <strong>{phaseLabel}</strong>
          </article>
        </div>

        {spectatorState.result && (
          <section className={styles.spectatorResultCard}>
            <span>Ván đã kết thúc</span>
            <strong>{spectatorState.result.winnerText}</strong>
            <p>Bạn có muốn tham gia phòng này cho ván kế tiếp không?</p>
          </section>
        )}

        <div className={styles.playerList} aria-label="Danh sách người chơi">
          {spectatorState.players.map((player) => (
            <article className={styles.playerRow} key={player.id}>
              <div className={styles.playerIdentity}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.playerAvatar}
                  height={48}
                  src={getPlayerAvatarPath(player.avatarKey)}
                  width={48}
                />
                <div>
                  <div className={styles.playerNameLine}>
                    <strong>{player.name}</strong>
                  </div>
                  <span>{player.isHost ? "Chủ phòng" : "Đang trong ván"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {message && <p className={styles.inlineError}>{message}</p>}

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            disabled={!canJoinNow || isPending}
            type="button"
            onClick={joinNextGame}
          >
            {isPending ? <LoaderCircle aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            {canJoinNow ? "Tham gia ngay" : "Chờ ván kết thúc"}
          </button>
        </div>
      </section>
    </main>
  );
}
