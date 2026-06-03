"use client";

import {
  Copy,
  Crown,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Play,
  RotateCw,
  UserX,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getWolfLobbyState,
  joinWolfRoom,
  kickWolfPlayer,
  leaveWolfRoom,
  startWolfGame,
  toggleWolfReady,
  type WolfLobbyState,
} from "../../actions";
import styles from "../../page.module.css";

type WolfRoomLobbyProps = {
  initialState: WolfLobbyState;
};

export default function WolfRoomLobby({ initialState }: WolfRoomLobbyProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [lobbyState, setLobbyState] = useState(initialState);
  const [connectionStatus, setConnectionStatus] = useState("Đang kết nối realtime...");
  const [errorMessage, setErrorMessage] = useState("");
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLeaveWarningOpen, setIsLeaveWarningOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentPlayer = lobbyState.players.find(
    (player) => player.id === lobbyState.currentPlayerId
  );
  const isCurrentPlayerHost = Boolean(currentPlayer?.isHost);
  const allPlayersReady =
    lobbyState.players.length >= 3 && lobbyState.players.every((player) => player.isReady);

  useEffect(() => {
    if (lobbyState.room.status === "playing" && lobbyState.room.currentGameId) {
      router.push(`/games/wolf/rooms/${lobbyState.room.code}/play`);
    }
  }, [lobbyState.room.code, lobbyState.room.currentGameId, lobbyState.room.status, router]);

  const refreshLobby = useCallback(async () => {
    const nextLobbyState = await getWolfLobbyState(lobbyState.room.code);

    if (nextLobbyState) {
      setLobbyState(nextLobbyState);
    }
  }, [lobbyState.room.code]);

  useEffect(() => {
    const channel = supabase
      .channel(`wolf-room:${lobbyState.room.code}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_room_players",
          filter: `room_id=eq.${lobbyState.room.id}`,
        },
        () => {
          void refreshLobby();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wolf_rooms",
          filter: `id=eq.${lobbyState.room.id}`,
        },
        () => {
          void refreshLobby();
        }
      )
      .subscribe((status) => {
        setConnectionStatus(status === "SUBSCRIBED" ? "Realtime đã kết nối" : "Đang kết nối realtime...");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lobbyState.room.code, lobbyState.room.id, refreshLobby, supabase]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const savedGuestName = readStoredGuestPlayerName();
      const hasSession = Boolean(data.session);

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setIsLoggedIn(hasSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const savedGuestName = readStoredGuestPlayerName();

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setIsLoggedIn(Boolean(session));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  function getCurrentPlayerName() {
    if (isLoggedIn) {
      return undefined;
    }

    const normalizedGuestName = guestName.trim();
    return normalizedGuestName || null;
  }

  function ensurePlayerIdentity() {
    const playerName = getCurrentPlayerName();

    if (playerName === null) {
      setIsIdentityOpen(true);
      return null;
    }

    return playerName;
  }

  function saveGuestName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedGuestName = guestNameInput
      .trim()
      .slice(0, MAX_GUEST_PLAYER_NAME_LENGTH);

    if (!normalizedGuestName) {
      setGuestNameError("Vui lòng nhập tên để chơi với vai trò khách.");
      return;
    }

    saveStoredGuestPlayerName(normalizedGuestName);
    setGuestName(normalizedGuestName);
    setGuestNameInput(normalizedGuestName);
    setGuestNameError("");
    setIsGuestFormOpen(false);
    setIsIdentityOpen(false);
  }

  function joinCurrentRoom() {
    const playerName = ensurePlayerIdentity();

    if (playerName === null) {
      return;
    }

    setErrorMessage("");
    startTransition(async () => {
      const result = await joinWolfRoom(lobbyState.room.code, playerName);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function toggleReady() {
    startTransition(async () => {
      await toggleWolfReady(lobbyState.room.code);
      await refreshLobby();
    });
  }

  function kickPlayer(playerId: string) {
    setErrorMessage("");
    startTransition(async () => {
      const result = await kickWolfPlayer(lobbyState.room.code, playerId);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function startGame() {
    setErrorMessage("");
    startTransition(async () => {
      const result = await startWolfGame(lobbyState.room.code);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}/play`);
    });
  }

  function leaveRoom() {
    startTransition(async () => {
      await leaveWolfRoom(lobbyState.room.code);
      router.push("/games/wolf");
    });
  }

  function requestLeaveRoom() {
    const hasOtherPlayers = lobbyState.players.length > 1;

    if (isCurrentPlayerHost && hasOtherPlayers) {
      setIsLeaveWarningOpen(true);
      return;
    }

    leaveRoom();
  }

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(`Đã copy ${label}.`);
    } catch {
      setCopyFeedback(`Không thể copy ${label}.`);
    }
  }

  function copyRoomCode() {
    void copyToClipboard(lobbyState.room.code, "mã phòng");
  }

  function copyRoomUrl() {
    void copyToClipboard(window.location.href, "URL phòng");
  }

  return (
    <main className={`${styles.page} ${styles.roomPage}`}>
      <section className={styles.roomPanel}>
        <p className={styles.eyebrow}>Phòng chờ</p>

        <div className={styles.roomCodeCard} aria-label="Mã phòng">
          <span>Mã phòng</span>
          <strong>{lobbyState.room.code}</strong>
        </div>

        <div className={styles.roomShareActions} aria-label="Chia sẻ phòng">
          <button className={styles.smallButton} type="button" onClick={copyRoomCode}>
            <Copy aria-hidden="true" />
            Copy mã
          </button>
          <button className={styles.smallButton} type="button" onClick={copyRoomUrl}>
            <LinkIcon aria-hidden="true" />
            Copy URL
          </button>
        </div>
        {copyFeedback && (
          <p className={styles.copyFeedback} aria-live="polite">
            {copyFeedback}
          </p>
        )}

        <p className={styles.description}>
          Gửi mã phòng này cho bạn bè. Khi người khác nhập mã và vào phòng, danh
          sách bên dưới sẽ tự cập nhật realtime.
        </p>

        <div className={styles.lobbyHeader}>
          <div>
            <span>{connectionStatus}</span>
            <strong>{lobbyState.players.length}/10 người chơi</strong>
          </div>
          <button
            className={styles.smallButton}
            type="button"
            disabled={isPending}
            onClick={() => void refreshLobby()}
          >
            <RotateCw aria-hidden="true" />
            Đồng bộ
          </button>
        </div>

        <div className={styles.playerList} aria-label="Danh sách người chơi">
          {lobbyState.players.map((player) => (
            <article className={styles.playerRow} key={player.id}>
              <div>
                <strong>{player.name}</strong>
                <span>{player.isReady ? "Đã sẵn sàng" : "Chưa sẵn sàng"}</span>
              </div>
              {player.isHost && (
                <span className={styles.hostBadge}>
                  <Crown aria-hidden="true" />
                  Chủ phòng
                </span>
              )}
              {isCurrentPlayerHost && !player.isHost && player.id !== currentPlayer?.id && (
                <button
                  aria-label={`Kick ${player.name}`}
                  className={styles.kickButton}
                  type="button"
                  disabled={isPending}
                  onClick={() => kickPlayer(player.id)}
                >
                  <UserX aria-hidden="true" />
                  Kick
                </button>
              )}
            </article>
          ))}
        </div>

        {errorMessage && <p className={styles.inlineError}>{errorMessage}</p>}

        <div className={styles.actions}>
          {!currentPlayer && (
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending}
              onClick={joinCurrentRoom}
            >
              <UserPlus aria-hidden="true" />
              Tham gia phòng
            </button>
          )}

          {currentPlayer && !isCurrentPlayerHost && (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isPending}
              onClick={toggleReady}
            >
              {currentPlayer.isReady ? "Hủy sẵn sàng" : "Sẵn sàng"}
            </button>
          )}

          {isCurrentPlayerHost && (
            <button
              className={styles.primaryButton}
              type="button"
              disabled={!allPlayersReady || isPending}
              onClick={startGame}
            >
              <Play aria-hidden="true" />
              {allPlayersReady ? "Bắt đầu" : "Chờ đủ người"}
            </button>
          )}

          <button
            className={styles.ghostButton}
            type="button"
            disabled={isPending}
            onClick={requestLeaveRoom}
          >
            <LogOut aria-hidden="true" />
            Thoát
          </button>
        </div>
      </section>

      {isLeaveWarningOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setIsLeaveWarningOpen(false)}
        >
          <section
            aria-labelledby="leave-room-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="leave-room-title">Chuyển chủ phòng</h2>
            <p>
              Trong phòng vẫn còn người chơi. Khi bạn thoát, quyền chủ phòng sẽ
              được chuyển cho người chơi khác.
            </p>

            <div className={styles.identityActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setIsLeaveWarningOpen(false)}
              >
                Ở lại
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                disabled={isPending}
                onClick={leaveRoom}
              >
                <LogOut aria-hidden="true" />
                Thoát phòng
              </button>
            </div>
          </section>
        </div>
      )}

      {isIdentityOpen && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => setIsIdentityOpen(false)}
        >
          <section
            aria-labelledby="room-identity-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="room-identity-title">Bạn chưa đăng nhập</h2>
            <p>Bạn có muốn đăng nhập không, hoặc chơi nhanh với vai trò khách?</p>

            <div className={styles.identityActions}>
              <Link className={styles.primaryButton} href="/#login">
                <LogIn aria-hidden="true" />
                ĐĂNG NHẬP
              </Link>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setIsGuestFormOpen(true)}
              >
                <UserRound aria-hidden="true" />
                CHƠI VỚI VAI TRÒ KHÁCH
              </button>
            </div>

            {isGuestFormOpen && (
              <form className={styles.guestForm} onSubmit={saveGuestName}>
                <label htmlFor="wolf-room-guest-name">Tên hiển thị</label>
                <input
                  autoFocus
                  id="wolf-room-guest-name"
                  maxLength={MAX_GUEST_PLAYER_NAME_LENGTH}
                  placeholder="Nhập tên của bạn"
                  type="text"
                  value={guestNameInput}
                  onChange={(event) => {
                    setGuestNameInput(event.target.value);
                    setGuestNameError("");
                  }}
                />
                {guestNameError && <span className={styles.errorText}>{guestNameError}</span>}
                <button className={styles.primaryButton} type="submit">
                  LƯU VÀ TIẾP TỤC
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
