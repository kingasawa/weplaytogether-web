"use client";

import {
  Crown,
  Link as LinkIcon,
  LogOut,
  Minus,
  Pencil,
  Play,
  Plus,
  Settings2,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { PlayerAvatarImage } from "@/components/ui/player-avatar-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import RoomJoinScreen from "@/app/games/room-join-screen";
import { buildAuthPath } from "@/lib/auth-redirect";
import {
  AVALON_MAX_PLAYERS,
  AVALON_MIN_PLAYERS,
  AVALON_ROLE_LABELS,
  AVALON_ROLE_ORDER,
  getDefaultAvalonDeck,
  type AvalonRole,
  type AvalonRolePreset,
} from "@/lib/avalon-game";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerAvatarObjectKey,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerAvatarKey,
  saveStoredGuestPlayerAvatarObjectKey,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  getPlayerAvatarSrc,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import { useWolfRoomPresence } from "@/lib/pusher/use-wolf-room-presence";
import { isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readStoredAccountProfile } from "@/lib/user-profile";
import {
  getAvalonLobbyState,
  joinAvalonRoom,
  kickAvalonPlayer,
  leaveAvalonRoom,
  startAvalonGame,
  toggleAvalonReady,
  updateAvalonPlayerProfile,
  type AvalonLobbyState,
  type AvalonSpectatorState,
} from "../../actions";
import styles from "../../../wolf/page.module.css";

type AvalonRoomLobbyProps = {
  initialState: AvalonLobbyState;
  initialSpectatorState: AvalonSpectatorState | null;
};

function countRoles(roles: AvalonRole[]) {
  return AVALON_ROLE_ORDER.map((role) => ({
    role,
    count: roles.filter((selectedRole) => selectedRole === role).length,
  }));
}

function AvalonRoomSpectator({ initialState }: { initialState: AvalonSpectatorState }) {
  const [state, setState] = useState(initialState);

  const refreshSpectator = useCallback(async () => {
    const nextState = await getAvalonLobbyState(state.room.code);

    if (nextState) {
      setState((currentState) => ({
        ...currentState,
        room: nextState.room,
        players: nextState.players,
      }));
    }
  }, [state.room.code]);

  useWolfRoomPresence({
    enabled: true,
    mode: "public",
    roomCode: state.room.code,
    onRoomUpdate: refreshSpectator,
    onPlayUpdate: refreshSpectator,
  });

  return (
    <main className={`${styles.page} ${styles.spectatorPage} ${styles.avalonTheme}`}>
      <section className={styles.spectatorPanel}>
        <div className={styles.spectatorHero}>
          <span>Đang quan sát</span>
          <h1>Phòng {state.room.code.toUpperCase()}</h1>
          <p>Ván Avalon đã bắt đầu. Bạn có thể chờ chủ phòng đưa mọi người về lobby.</p>
        </div>
        <div className={styles.spectatorStatusGrid}>
          <article>
            <UserRound aria-hidden="true" />
            <span>Người chơi</span>
            <strong>{state.players.length}/{AVALON_MAX_PLAYERS}</strong>
          </article>
          <article>
            <Crown aria-hidden="true" />
            <span>Trạng thái</span>
            <strong>{state.game?.phaseLabel ?? "Đang chơi"}</strong>
          </article>
        </div>
        {state.result && (
          <article className={styles.spectatorResultCard}>
            <span>Kết quả</span>
            <strong>{state.result.winnerText}</strong>
            <p>{state.result.winnerReason}</p>
          </article>
        )}
      </section>
    </main>
  );
}

export default function AvalonRoomLobby({
  initialState,
  initialSpectatorState,
}: AvalonRoomLobbyProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [lobbyState, setLobbyState] = useState(initialState);
  const [errorMessage, setErrorMessage] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [rolePreset, setRolePreset] = useState<AvalonRolePreset>("recommended");
  const [selectedRoles, setSelectedRoles] = useState<AvalonRole[]>(() =>
    getDefaultAvalonDeck(initialState.players.length, "recommended")
  );
  const [ladyOfLake, setLadyOfLake] = useState(false);
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLeaveWarningOpen, setIsLeaveWarningOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestAvatarKey, setGuestAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarInput, setGuestAvatarInput] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarObjectKey, setGuestAvatarObjectKey] = useState<string | null>(null);
  const [guestAvatarObjectKeyInput, setGuestAvatarObjectKeyInput] = useState<string | null>(null);
  const [guestNameError, setGuestNameError] = useState("");
  const [shouldJoinAfterGuestName, setShouldJoinAfterGuestName] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentPlayer = lobbyState.players.find((player) => player.id === lobbyState.currentPlayerId);
  const isCurrentPlayerHost = Boolean(currentPlayer?.isHost);
  const playerCount = lobbyState.players.length;
  const allPlayersReady =
    playerCount >= AVALON_MIN_PLAYERS &&
    playerCount <= AVALON_MAX_PLAYERS &&
    lobbyState.players.every((player) => player.isReady);
  const shouldShowSetup = isSetupOpen && isCurrentPlayerHost;
  const effectiveSelectedRoles =
    rolePreset === "custom" ? selectedRoles : getDefaultAvalonDeck(playerCount, rolePreset);
  const selectedRoleCounts = countRoles(effectiveSelectedRoles);

  useEffect(() => {
    if (currentPlayer && lobbyState.room.status === "playing" && lobbyState.room.currentGameId) {
      router.push(`/games/avalon/rooms/${lobbyState.room.code}/play`);
    }
  }, [currentPlayer, lobbyState.room.code, lobbyState.room.currentGameId, lobbyState.room.status, router]);

  // Toast copy tự ẩn sau vài giây, không cần bấm tắt.
  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopyFeedback(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  const refreshLobby = useCallback(async () => {
    const nextLobbyState = await getAvalonLobbyState(lobbyState.room.code);

    if (nextLobbyState) {
      setLobbyState((currentState) => ({
        ...nextLobbyState,
        currentPlayerId: nextLobbyState.currentPlayerId ?? currentState.currentPlayerId,
      }));
    }
  }, [lobbyState.room.code]);

  const { connectionStatus, isPresenceReady, onlinePlayerIds } = useWolfRoomPresence({
    enabled: Boolean(currentPlayer),
    roomCode: lobbyState.room.code,
    onRoomUpdate: refreshLobby,
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const savedGuestName = readStoredGuestPlayerName();
      const savedGuestAvatarKey = readStoredGuestPlayerAvatarKey();
      const savedGuestAvatarObjectKey = readStoredGuestPlayerAvatarObjectKey();

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
      setGuestAvatarObjectKey(savedGuestAvatarObjectKey);
      setGuestAvatarObjectKeyInput(savedGuestAvatarObjectKey);
      const hasSession = isAllowedGmailSession(data.session);
      setIsLoggedIn(hasSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const savedGuestName = readStoredGuestPlayerName();
      const savedGuestAvatarKey = readStoredGuestPlayerAvatarKey();
      const savedGuestAvatarObjectKey = readStoredGuestPlayerAvatarObjectKey();

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
      setGuestAvatarObjectKey(savedGuestAvatarObjectKey);
      setGuestAvatarObjectKeyInput(savedGuestAvatarObjectKey);
      const hasSession = isAllowedGmailSession(session);
      setIsLoggedIn(hasSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  function renderPlayerConnectionStatus(playerId: string) {
    if (!currentPlayer) {
      return null;
    }

    if (playerId === currentPlayer.id) {
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
        <span aria-label="Online" className={`${styles.connectionBadge} ${styles.connectionBadgeOnline}`} title="Online">
          <span aria-hidden="true" className={styles.connectionDot} />
          Online
        </span>
      );
    }

    return (
      <span aria-label="Đã thoát game" className={`${styles.connectionBadge} ${styles.connectionBadgeOffline}`} title="Đã thoát game">
        <span aria-hidden="true" className={styles.connectionDot} />
        Offline
      </span>
    );
  }

  // Đọc session trực tiếp ngay lúc gọi thay vì dùng state accountUserId (state cập nhật
  // qua effect async nên có thể chưa kịp set nếu user bấm tham gia/lưu ngay khi vừa vào
  // trang — dẫn tới gửi userId rỗng dù đã đăng nhập, làm khung/điểm không gắn được vào tài
  // khoản).
  async function getFreshAccountUserId() {
    const { data } = await supabase.auth.getSession();
    return isAllowedGmailSession(data.session) ? data.session?.user.id ?? null : null;
  }

  function getCurrentPlayerName() {
    if (isLoggedIn) {
      return readStoredAccountProfile()?.displayName.trim() || undefined;
    }

    const normalizedGuestName = guestName.trim();
    return normalizedGuestName || null;
  }

  function getCurrentPlayerAvatarKey() {
    return isLoggedIn ? readStoredAccountProfile()?.avatarKey : guestAvatarKey;
  }

  function getCurrentPlayerAvatarObjectKey() {
    return isLoggedIn ? readStoredAccountProfile()?.avatarObjectKey ?? null : guestAvatarObjectKey;
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

  function runJoinCurrentRoom(playerName?: string, avatarKey?: string, avatarObjectKey?: string | null) {
    setErrorMessage("");
    startTransition(async () => {
      const freshUserId = await getFreshAccountUserId();
      const result = await joinAvalonRoom(
        lobbyState.room.code,
        playerName,
        avatarKey,
        avatarObjectKey,
        freshUserId
      );

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function saveGuestName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedGuestName = guestNameInput.trim().slice(0, MAX_GUEST_PLAYER_NAME_LENGTH);

    if (!normalizedGuestName) {
      setGuestNameError("Vui lòng nhập tên để chơi với vai trò khách.");
      return;
    }

    saveStoredGuestPlayerName(normalizedGuestName);
    const savedAvatarKey = saveStoredGuestPlayerAvatarKey(guestAvatarInput);
    const savedAvatarObjectKey = saveStoredGuestPlayerAvatarObjectKey(guestAvatarObjectKeyInput);
    setGuestName(normalizedGuestName);
    setGuestNameInput(normalizedGuestName);
    setGuestAvatarKey(savedAvatarKey);
    setGuestAvatarInput(savedAvatarKey);
    setGuestAvatarObjectKey(savedAvatarObjectKey);
    setGuestAvatarObjectKeyInput(savedAvatarObjectKey);
    setGuestNameError("");
    setIsGuestFormOpen(false);
    setIsIdentityOpen(false);

    if (shouldJoinAfterGuestName) {
      setShouldJoinAfterGuestName(false);
      runJoinCurrentRoom(normalizedGuestName, savedAvatarKey, savedAvatarObjectKey);
    } else if (lobbyState.currentPlayerId) {
      runUpdateRoomProfile(normalizedGuestName, savedAvatarKey, savedAvatarObjectKey);
    }
  }

  function joinCurrentRoom() {
    const playerName = ensurePlayerIdentity();

    if (playerName !== null) {
      runJoinCurrentRoom(playerName, getCurrentPlayerAvatarKey(), getCurrentPlayerAvatarObjectKey());
    }
  }

  function openGuestProfileEditor() {
    setShouldJoinAfterGuestName(false);
    setGuestNameInput(guestName);
    setGuestAvatarInput(guestAvatarKey);
    setGuestAvatarObjectKeyInput(guestAvatarObjectKey);
    setGuestNameError("");
    setIsIdentityOpen(true);
    setIsGuestFormOpen(true);
  }

  // Mở chỉnh sửa tên/avatar khi đã ở trong phòng, prefill theo hồ sơ hiện tại.
  function openRoomProfileEditor() {
    const current = lobbyState.players.find(
      (player) => player.id === lobbyState.currentPlayerId
    );

    setShouldJoinAfterGuestName(false);
    setGuestNameInput(current?.name ?? guestName);
    setGuestAvatarInput((current?.avatarKey as PlayerAvatarKey | undefined) ?? guestAvatarKey);
    setGuestAvatarObjectKeyInput(current?.avatarObjectKey ?? guestAvatarObjectKey);
    setGuestNameError("");
    setIsIdentityOpen(true);
    setIsGuestFormOpen(true);
  }

  function runUpdateRoomProfile(
    name: string,
    avatarKey: string,
    avatarObjectKey: string | null
  ) {
    setErrorMessage("");
    startTransition(async () => {
      const freshUserId = await getFreshAccountUserId();
      const result = await updateAvalonPlayerProfile(
        lobbyState.room.code,
        name,
        avatarKey,
        avatarObjectKey,
        freshUserId
      );

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function toggleReady() {
    startTransition(async () => {
      const result = await toggleAvalonReady(lobbyState.room.code);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function kickPlayer(playerId: string) {
    setErrorMessage("");
    startTransition(async () => {
      const result = await kickAvalonPlayer(lobbyState.room.code, playerId);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      await refreshLobby();
    });
  }

  function openSetup() {
    setErrorMessage("");

    if (!allPlayersReady) {
      setErrorMessage("Cần 5-10 người và tất cả người chơi phải sẵn sàng.");
      return;
    }

    setSelectedRoles(getDefaultAvalonDeck(playerCount, rolePreset));
    setIsSetupOpen(true);
  }

  function addRole(role: AvalonRole) {
    const baseRoles = rolePreset === "custom" ? selectedRoles : effectiveSelectedRoles;
    setRolePreset("custom");

    if (baseRoles.length >= playerCount) {
      return;
    }

    setSelectedRoles([...baseRoles, role]);
  }

  function removeRole(role: AvalonRole) {
    const baseRoles = rolePreset === "custom" ? selectedRoles : effectiveSelectedRoles;
    setRolePreset("custom");
    const index = baseRoles.lastIndexOf(role);

    if (index < 0) {
      setSelectedRoles(baseRoles);
      return;
    }

    setSelectedRoles([...baseRoles.slice(0, index), ...baseRoles.slice(index + 1)]);
  }

  function startGame() {
    setErrorMessage("");
    startTransition(async () => {
      const result = await startAvalonGame(lobbyState.room.code, {
        rolePreset,
        selectedRoles: rolePreset === "custom" ? effectiveSelectedRoles : undefined,
        ladyOfLake,
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      router.push(`/games/avalon/rooms/${result.roomCode}/play`);
    });
  }

  function leaveRoom() {
    startTransition(async () => {
      await leaveAvalonRoom(lobbyState.room.code);
      router.push("/games/avalon");
    });
  }

  function requestLeaveRoom() {
    if (isCurrentPlayerHost && lobbyState.players.length > 1) {
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

  function closeIdentityModal() {
    setIsIdentityOpen(false);
    setIsGuestFormOpen(false);
    setShouldJoinAfterGuestName(false);
  }

  const isEditingGuestProfile = isGuestFormOpen && !shouldJoinAfterGuestName;

  if (lobbyState.room.status === "playing" && !currentPlayer) {
    return (
      <AvalonRoomSpectator
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

  if (isIdentityOpen) {
    return (
      <RoomJoinScreen
        gameName="Avalon"
        roomCode={lobbyState.room.code}
        themeClassName={`${styles.avalonTheme}`}
        titleId="room-identity-title"
        signInHref={buildAuthPath("/auth/sign-in", `/games/avalon/rooms/${lobbyState.room.code}`)}
        guestNameInputId="avalon-room-guest-name"
        isEditingGuestProfile={isEditingGuestProfile}
        isGuestFormOpen={isGuestFormOpen}
        guestNameInput={guestNameInput}
        guestAvatarKey={guestAvatarInput}
        guestAvatarObjectKey={guestAvatarObjectKeyInput}
        guestNameError={guestNameError}
        onBack={closeIdentityModal}
        onShowGuestForm={() => setIsGuestFormOpen(true)}
        onSubmitGuestName={saveGuestName}
        onGuestNameInputChange={(value) => {
          setGuestNameInput(value);
          setGuestNameError("");
        }}
        onSelectAvatar={setGuestAvatarInput}
        onSelectAvatarObjectKey={setGuestAvatarObjectKeyInput}
      />
    );
  }

  return (
    <main className={`${styles.page} ${styles.roomPage} ${styles.avalonTheme}`}>
      <section className={styles.roomPanel}>
        {shouldShowSetup ? (
          <div className={styles.roleSetup}>
            <div className={styles.roleSetupHeader}>
              <div>
                <span>Thiết lập ván</span>
                <strong>{playerCount} người chơi</strong>
              </div>
              <p>Good/Evil sẽ được server kiểm tra khi bắt đầu.</p>
            </div>

            <div className={styles.avalonPresetGrid} role="group" aria-label="Chọn preset role">
              {(["recommended", "basic", "custom"] as AvalonRolePreset[]).map((preset) => (
                <button
                  className={`${styles.visibilityOption} ${
                    rolePreset === preset ? styles.visibilityOptionActive : ""
                  }`}
                  type="button"
                  key={preset}
                  aria-pressed={rolePreset === preset}
                  onClick={() => setRolePreset(preset)}
                >
                  <Settings2 aria-hidden="true" />
                  <span>
                    <strong>
                      {preset === "recommended" ? "Recommended" : preset === "basic" ? "Basic" : "Custom"}
                    </strong>
                    <small>
                      {preset === "recommended"
                        ? "Merlin, Assassin và vai đặc biệt cân bằng"
                        : preset === "basic"
                          ? "Merlin, Assassin, Servant, Minion"
                          : "Tự chỉnh role deck"}
                    </small>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.roleSetupGrid}>
              {selectedRoleCounts.map(({ role, count }) => (
                <div className={styles.avalonRoleCounter} key={role}>
                  <strong>{AVALON_ROLE_LABELS[role]}</strong>
                  <div>
                    <button
                      aria-label={`Giảm ${AVALON_ROLE_LABELS[role]}`}
                      type="button"
                      disabled={rolePreset !== "custom" || isPending || count === 0}
                      onClick={() => removeRole(role)}
                    >
                      <Minus aria-hidden="true" />
                    </button>
                    <span>{count}</span>
                    <button
                      aria-label={`Tăng ${AVALON_ROLE_LABELS[role]}`}
                      type="button"
                      disabled={rolePreset !== "custom" || isPending || selectedRoles.length >= playerCount}
                      onClick={() => addRole(role)}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.avalonOptionList}>
              <label>
                <input
                  type="checkbox"
                  checked={ladyOfLake}
                  onChange={(event) => setLadyOfLake(event.target.checked)}
                />
                <span>Lady of the Lake</span>
              </label>
            </div>

            {errorMessage && <p className={styles.inlineError}>{errorMessage}</p>}

            <div className={styles.actions}>
              <button className={styles.primaryButton} type="button" disabled={isPending} onClick={startGame}>
                <Play aria-hidden="true" />
                Bắt đầu Avalon
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                disabled={isPending}
                onClick={() => setIsSetupOpen(false)}
              >
                Quay lại
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className={styles.roomHeaderBar}>
              <div className={styles.roomHeaderIdentity}>
                <strong className={styles.roomHeaderCode}>{lobbyState.room.code}</strong>
                <button
                  className={styles.roomHeaderIconButton}
                  type="button"
                  aria-label="Copy URL phòng"
                  onClick={() => copyToClipboard(window.location.href, "URL phòng")}
                >
                  <LinkIcon aria-hidden="true" />
                </button>
                {copyFeedback && (
                  <p className={styles.copyFeedback} aria-live="polite">
                    {copyFeedback}
                  </p>
                )}
              </div>
              <button
                className={`${styles.roomHeaderIconButton} ${styles.roomHeaderExitButton}`}
                type="button"
                aria-label="Thoát phòng"
                disabled={isPending}
                onClick={requestLeaveRoom}
              >
                <LogOut aria-hidden="true" />
              </button>
            </header>

            <div className={styles.playerListHeader}>
              <span>Danh sách</span>
              <span>{playerCount}/10</span>
            </div>
            <div className={styles.playerList} aria-label="Danh sách người chơi">
              {lobbyState.players.map((player) => (
                <article
                  className={
                    player.profileFrameUrl
                      ? `${styles.playerRow} ${styles.playerRowFramed}`
                      : styles.playerRow
                  }
                  key={player.id}
                >
                  {player.profileFrameUrl && (
                    <span
                      aria-hidden="true"
                      className={styles.playerRowFrameOverlay}
                      style={{ borderImageSource: `url(${player.profileFrameUrl})` }}
                    />
                  )}
                  <div className={styles.playerIdentity}>
                    <span className={styles.playerAvatarFrameWrap}>
                      <PlayerAvatarImage
                        alt=""
                        aria-hidden="true"
                        className={
                          player.avatarFrameUrl
                            ? `${styles.playerAvatar} ${styles.playerAvatarFramed}`
                            : styles.playerAvatar
                        }
                        width={48}
                        height={48}
                        src={getPlayerAvatarSrc(player.avatarKey, player.avatarUrl)}
                        avatarKey={player.avatarKey}
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
                        <span className={styles.playerNameActions}>
                          <strong>{player.name}</strong>
                          {player.id === currentPlayer?.id && lobbyState.room.status === "waiting" && (
                            <button
                              aria-label="Đổi tên và avatar"
                              className={styles.playerEditButton}
                              type="button"
                              disabled={isPending}
                              title="Đổi tên và avatar"
                              onClick={openRoomProfileEditor}
                            >
                              <Pencil aria-hidden="true" />
                            </button>
                          )}
                          {renderPlayerConnectionStatus(player.id)}
                        </span>
                      </div>
                      <span>{player.isReady ? "Đã sẵn sàng" : "Chưa sẵn sàng"}</span>
                    </div>
                    <span className={styles.playerLineActions}>
                      {player.isHost && (
                        <span aria-label="Chủ phòng" className={styles.hostBadge} title="Chủ phòng">
                          <Crown aria-hidden="true" />
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
                          <Minus aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  </div>
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
                <button className={styles.primaryButton} type="button" disabled={isPending} onClick={joinCurrentRoom}>
                  Tham gia phòng
                </button>
              )}

              {currentPlayer && !isCurrentPlayerHost && (
                <button className={styles.secondaryButton} type="button" disabled={isPending} onClick={toggleReady}>
                  {currentPlayer.isReady ? "Hủy sẵn sàng" : "Sẵn sàng"}
                </button>
              )}

              {isCurrentPlayerHost && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={!allPlayersReady || isPending}
                  onClick={openSetup}
                >
                  {allPlayersReady ? "Thiết lập ván" : "Chờ đủ người"}
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {isLeaveWarningOpen && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setIsLeaveWarningOpen(false)}>
          <section
            aria-labelledby="leave-room-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="leave-room-title">Chuyển chủ phòng</h2>
            <p>Trong phòng vẫn còn người chơi. Khi bạn thoát, quyền chủ phòng sẽ chuyển cho người khác.</p>
            <div className={styles.identityActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => setIsLeaveWarningOpen(false)}>
                Ở lại
              </button>
              <button className={styles.exitButton} type="button" disabled={isPending} onClick={leaveRoom}>
                <LogOut aria-hidden="true" />
                Thoát phòng
              </button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
