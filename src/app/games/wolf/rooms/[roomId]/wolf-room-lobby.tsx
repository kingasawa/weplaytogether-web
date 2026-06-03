"use client";

import {
  Crown,
  LogIn,
  LogOut,
  Play,
  RotateCw,
  UserPlus,
  UserRound,
  UsersRound,
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
  leaveWolfRoom,
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentPlayer = lobbyState.players.find(
    (player) => player.id === lobbyState.currentPlayerId
  );
  const isCurrentPlayerHost = Boolean(currentPlayer?.isHost);
  const allPlayersReady =
    lobbyState.players.length >= 3 && lobbyState.players.every((player) => player.isReady);

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

  function leaveRoom() {
    startTransition(async () => {
      await leaveWolfRoom(lobbyState.room.code);
      router.push("/");
    });
  }

  return (
    <main className={`${styles.page} ${styles.roomPage}`}>
      <section className={styles.roomPanel}>
        <p className={styles.eyebrow}>
          <UsersRound aria-hidden="true" />
          Phòng chờ realtime
        </p>
        <h1>Phòng {lobbyState.room.code.toUpperCase()}</h1>
        <p className={styles.description}>
          Gửi mã phòng này cho bạn bè. Khi người khác nhập mã và vào phòng, danh
          sách bên dưới sẽ tự cập nhật realtime.
        </p>

        <div className={styles.roomCodeCard} aria-label="Mã phòng">
          <span>Mã phòng</span>
          <strong>{lobbyState.room.code}</strong>
        </div>

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

          {currentPlayer && (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isPending || currentPlayer.isHost}
              onClick={toggleReady}
            >
              {currentPlayer.isReady ? "Hủy sẵn sàng" : "Sẵn sàng"}
            </button>
          )}

          {isCurrentPlayerHost && (
            <button className={styles.primaryButton} type="button" disabled={!allPlayersReady}>
              <Play aria-hidden="true" />
              Chờ đủ người
            </button>
          )}

          <button className={styles.ghostButton} type="button" disabled={isPending} onClick={leaveRoom}>
            <LogOut aria-hidden="true" />
            Thoát
          </button>

          <Link className={styles.exitButton} href="/games/wolf">
            Về màn game
          </Link>
        </div>
      </section>

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
