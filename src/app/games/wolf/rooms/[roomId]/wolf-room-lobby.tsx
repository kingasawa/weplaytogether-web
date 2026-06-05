"use client";

import {
  Copy,
  Crown,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Play,
  UserX,
  UserPlus,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerAvatarKey,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  getPlayerAvatarPath,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getWolfLobbyState,
  joinWolfRoom,
  kickWolfPlayer,
  leaveWolfRoom,
  startWolfGame,
  toggleWolfReady,
  type WolfLobbyState,
  type WolfSpectatorState,
} from "../../actions";
import { PlayerAvatarPicker } from "../../player-avatar-picker";
import styles from "../../page.module.css";
import WolfRoomSpectator from "./wolf-room-spectator";

type WolfRoomLobbyProps = {
  initialState: WolfLobbyState;
  initialSpectatorState: WolfSpectatorState | null;
};

export default function WolfRoomLobby({ initialState, initialSpectatorState }: WolfRoomLobbyProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [lobbyState, setLobbyState] = useState(initialState);
  const [errorMessage, setErrorMessage] = useState("");
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLeaveWarningOpen, setIsLeaveWarningOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestAvatarKey, setGuestAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarInput, setGuestAvatarInput] =
    useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestNameError, setGuestNameError] = useState("");
  const [shouldJoinAfterGuestName, setShouldJoinAfterGuestName] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const currentPlayer = lobbyState.players.find(
    (player) => player.id === lobbyState.currentPlayerId
  );
  const isCurrentPlayerHost = Boolean(currentPlayer?.isHost);
  const allPlayersReady =
    lobbyState.players.length >= 3 && lobbyState.players.every((player) => player.isReady);

  useEffect(() => {
    if (currentPlayer && lobbyState.room.status === "playing" && lobbyState.room.currentGameId) {
      router.push(`/games/wolf/rooms/${lobbyState.room.code}/play`);
    }
  }, [currentPlayer, lobbyState.room.code, lobbyState.room.currentGameId, lobbyState.room.status, router]);

  const refreshLobby = useCallback(async () => {
    const nextLobbyState = await getWolfLobbyState(lobbyState.room.code);

    if (nextLobbyState) {
      setLobbyState((currentState) => {
        if (
          nextLobbyState.currentPlayerId ||
          !currentState.currentPlayerId ||
          !nextLobbyState.players.some((player) => player.id === currentState.currentPlayerId)
        ) {
          return nextLobbyState;
        }

        return {
          ...nextLobbyState,
          currentPlayerId: currentState.currentPlayerId,
        };
      });
    }
  }, [lobbyState.room.code]);

  const { connectionStatus, isPresenceReady, onlinePlayerIds } = useWolfRoomPresence({
    enabled: Boolean(currentPlayer),
    roomCode: lobbyState.room.code,
    onRoomUpdate: refreshLobby,
  });

  function renderPlayerConnectionStatus(playerId: string) {
    if (!currentPlayer) {
      return null;
    }

    if (connectionStatus !== "Đang kết nối Người chơi..." && connectionStatus !== "Người chơi đã kết nối") {
      return <span className={styles.connectionBadge}>{connectionStatus}</span>;
    }

    if (!isPresenceReady) {
      return <span className={styles.connectionBadge}>Kiểm tra kết nối</span>;
    }

    if (onlinePlayerIds.includes(playerId)) {
      return (
        <span className={`${styles.connectionBadge} ${styles.connectionBadgeOnline}`}>
          <span aria-hidden="true" className={styles.connectionDot} />
          Online
        </span>
      );
    }

    return <span className={styles.connectionBadge}>Đã thoát game</span>;
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const savedGuestName = readStoredGuestPlayerName();
      const savedGuestAvatarKey = readStoredGuestPlayerAvatarKey();
      const hasSession = Boolean(data.session);

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
      setIsLoggedIn(hasSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const savedGuestName = readStoredGuestPlayerName();
      const savedGuestAvatarKey = readStoredGuestPlayerAvatarKey();

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
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
      setShouldJoinAfterGuestName(true);
      setIsIdentityOpen(true);
      setIsGuestFormOpen(true);
      return null;
    }

    return playerName;
  }

  function getCurrentPlayerAvatarKey() {
    if (isLoggedIn) {
      return undefined;
    }

    return guestAvatarKey;
  }

  function runJoinCurrentRoom(playerName?: string, avatarKey?: string) {
    setErrorMessage("");
    startTransition(async () => {
      const result = await joinWolfRoom(lobbyState.room.code, playerName, avatarKey);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      setLobbyState((currentState) => ({
        ...currentState,
        players: currentState.players.some((player) => player.id === result.playerId)
          ? currentState.players.map((player) =>
              player.id === result.playerId
                ? { ...player, name: result.playerName, avatarKey: result.playerAvatarKey }
                : player
            )
          : [
              ...currentState.players,
              {
                id: result.playerId,
                name: result.playerName,
                avatarKey: result.playerAvatarKey,
                isHost: false,
                isReady: false,
                joinedAt: new Date().toISOString(),
              },
            ],
        currentPlayerId: result.playerId,
      }));
    });
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
    const savedAvatarKey = saveStoredGuestPlayerAvatarKey(guestAvatarInput);
    setGuestName(normalizedGuestName);
    setGuestNameInput(normalizedGuestName);
    setGuestAvatarKey(savedAvatarKey);
    setGuestAvatarInput(savedAvatarKey);
    setGuestNameError("");
    setIsGuestFormOpen(false);
    setIsIdentityOpen(false);

    if (shouldJoinAfterGuestName) {
      setShouldJoinAfterGuestName(false);
      runJoinCurrentRoom(normalizedGuestName, savedAvatarKey);
    }
  }

  function joinCurrentRoom() {
    const playerName = ensurePlayerIdentity();

    if (playerName === null) {
      return;
    }

    runJoinCurrentRoom(playerName, getCurrentPlayerAvatarKey());
  }

  function openGuestProfileEditor() {
    setShouldJoinAfterGuestName(false);
    setGuestNameInput(guestName);
    setGuestAvatarInput(guestAvatarKey);
    setGuestNameError("");
    setIsIdentityOpen(true);
    setIsGuestFormOpen(true);
  }

  function toggleReady() {
    startTransition(async () => {
      await toggleWolfReady(lobbyState.room.code);
      setLobbyState((currentState) => ({
        ...currentState,
        players: currentState.players.map((player) =>
          player.id === currentState.currentPlayerId ? { ...player, isReady: !player.isReady } : player
        ),
      }));
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

      setLobbyState((currentState) => ({
        ...currentState,
        players: currentState.players.filter((player) => player.id !== playerId),
      }));
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

  function closeIdentityModal() {
    setIsIdentityOpen(false);
    setIsGuestFormOpen(false);
    setShouldJoinAfterGuestName(false);
  }

  const isEditingGuestProfile = isGuestFormOpen && !shouldJoinAfterGuestName;

  if (lobbyState.room.status === "playing" && !currentPlayer) {
    return (
      <WolfRoomSpectator
        initialState={
          initialSpectatorState ?? {
            room: lobbyState.room,
            players: lobbyState.players,
            game: null,
            result: null,
          }
        }
      />
    );
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
          Gửi mã phòng này cho bạn bè.
        </p>

        <div className={styles.lobbyHeader}>
          <div>
            <span>{connectionStatus}</span>
            <strong>{lobbyState.players.length}/10 người chơi</strong>
          </div>
        </div>

        <div className={styles.playerList} aria-label="Danh sách người chơi">
          {lobbyState.players.map((player) => (
            <article className={styles.playerRow} key={player.id}>
              <div className={styles.playerIdentity}>
                <Image
                  alt=""
                  aria-hidden="true"
                  className={styles.playerAvatar}
                  width={48}
                  height={48}
                  src={getPlayerAvatarPath(player.avatarKey)}
                />
                <div>
                  <div className={styles.playerNameLine}>
                    <strong>{player.name}</strong>
                    {renderPlayerConnectionStatus(player.id)}
                  </div>
                  <span>{player.isReady ? "Đã sẵn sàng" : "Chưa sẵn sàng"}</span>
                </div>
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
          {!currentPlayer && !isLoggedIn && (
            <button
              className={`${styles.ghostButton} ${styles.profileButton}`}
              type="button"
              disabled={isPending}
              onClick={openGuestProfileEditor}
            >
              <UserRound aria-hidden="true" />
              Tên & avatar
            </button>
          )}

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
            className={styles.exitButton}
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
          onClick={closeIdentityModal}
        >
          <section
            aria-labelledby="room-identity-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="room-identity-title">
              {isEditingGuestProfile ? "Tên & avatar" : "Bạn chưa đăng nhập"}
            </h2>
            <p>
              {isEditingGuestProfile
                ? "Thiết lập tên và avatar trước khi tham gia phòng."
                : "Bạn có muốn đăng nhập không, hoặc chơi nhanh với vai trò khách?"}
            </p>

            {!isEditingGuestProfile && (
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
            )}

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
                <PlayerAvatarPicker
                  selectedAvatarKey={guestAvatarInput}
                  onSelectAvatar={setGuestAvatarInput}
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
