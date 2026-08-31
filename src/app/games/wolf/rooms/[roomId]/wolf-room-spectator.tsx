"use client";

import { LoaderCircle, Trophy, UserPlus, Users } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import {
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerName,
} from "@/lib/guest-player";
import FrameEffects from "@/components/ui/frame-effects";
import { frameGlassStyle, frameMaskStyle, frameTintStyle } from "@/lib/frame-mask-style";
import { getPlayerAvatarSrc } from "@/lib/player-avatars";
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

  // Poll dự phòng + tự khôi phục khi kẹt đã nằm trong hook, không cần interval riêng ở đây.
  useWolfRoomPresence({
    enabled: true,
    mode: "public",
    roomCode: spectatorState.room.code,
    onPlayUpdate: refreshSpectatorState,
    onRoomUpdate: refreshSpectatorState,
  });

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

        <FrameEffects />
        <div className={styles.playerList} aria-label="Danh sách người chơi">
          {spectatorState.players.map((player) => (
            <article
              className={
                player.profileFrameUrl
                  ? `${styles.playerRow} ${styles.playerRowFramed}`
                  : styles.playerRow
              }
              data-player-row-shine-card={player.hasEquippedProfileFrame ? "" : undefined}
              key={player.id}
              style={frameTintStyle(player.profileFrameColor)}
            >
              {player.profileFrameUrl && (
                <>
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameInnerGlass}
                    style={frameGlassStyle(player.profileFrameColor)}
                  />
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameOverlay}
                    style={{ backgroundImage: `url(${player.profileFrameUrl})` }}
                  />
                </>
              )}
              {player.hasEquippedProfileFrame && player.profileFrameUrl && (
                <>
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameGlow}
                    style={frameMaskStyle(player.profileFrameUrl)}
                  />
                  <span
                    aria-hidden="true"
                    className={styles.playerRowFrameFlash}
                    data-frame-flash
                    style={frameMaskStyle(player.profileFrameUrl)}
                  />
                  <span className={styles.sparkle} data-frame-sparkle aria-hidden="true" />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleB}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleC}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleD}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleE}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleF}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleG}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                  <span
                    className={`${styles.sparkle} ${styles.sparkleH}`}
                    data-frame-sparkle
                    aria-hidden="true"
                  />
                </>
              )}
              <div className={styles.playerIdentity}>
                <span className={styles.playerAvatarFrameWrap}>
                  <Image
                    alt=""
                    aria-hidden="true"
                    className={
                      player.avatarFrameUrl
                        ? `${styles.playerAvatar} ${styles.playerAvatarFramed}`
                        : styles.playerAvatar
                    }
                    height={48}
                    src={getPlayerAvatarSrc(player.avatarKey, player.avatarUrl)}
                    width={48}
                  />
                  {player.avatarFrameUrl && (
                    <Image
                      alt=""
                      aria-hidden="true"
                      className={styles.playerAvatarFrameImg}
                      width={64}
                      height={64}
                      src={player.avatarFrameUrl}
                      unoptimized
                    />
                  )}
                </span>
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
