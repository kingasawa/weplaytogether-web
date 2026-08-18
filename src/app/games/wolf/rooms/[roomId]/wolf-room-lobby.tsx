"use client";

import {
  Copy,
  Crown,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Minus,
  Play,
  UserPlus,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerAvatarObjectKey,
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerAvatarObjectKey,
  saveStoredGuestPlayerAvatarKey,
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
import type { WolfRole } from "@/lib/supabase/types";
import { WOLF_ROLE_LABELS } from "@/lib/wolf-game";
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

type RoleLabelOption = { id: string; role: WolfRole };

const ROLE_LABEL_GROUPS: Array<{ id: string; options: RoleLabelOption[] }> = [
  {
    id: "villagers",
    options: [
      { id: "villager-1", role: "villager" },
      { id: "villager-2", role: "villager" },
      { id: "villager-3", role: "villager" },
    ],
  },
  {
    id: "werewolves",
    options: [
      { id: "werewolf-1", role: "werewolf" },
      { id: "werewolf-2", role: "werewolf" },
    ],
  },
  { id: "werewolf-seer", options: [{ id: "werewolf-seer", role: "werewolf_seer" }] },
  { id: "seer", options: [{ id: "seer", role: "seer" }] },
  { id: "robber", options: [{ id: "robber", role: "robber" }] },
  { id: "troublemaker", options: [{ id: "troublemaker", role: "troublemaker" }] },
  { id: "witch", options: [{ id: "witch", role: "witch" }] },
  { id: "drunk", options: [{ id: "drunk", role: "drunk" }] },
  { id: "insomniac", options: [{ id: "insomniac", role: "insomniac" }] },
  { id: "doppelganger", options: [{ id: "doppelganger", role: "doppelganger" }] },
  { id: "copycat", options: [{ id: "copycat", role: "copycat" }] },
];

const ROLE_LABEL_OPTIONS = ROLE_LABEL_GROUPS.flatMap((group) => group.options);
const ROLE_OPTION_ID_SET = new Set(ROLE_LABEL_OPTIONS.map((option) => option.id));
const STORED_ROLE_OPTION_IDS_KEY = "boardverse:wolf-role-option-ids";
const BASIC_ROLE_OPTION_IDS = [
  "werewolf-1",
  "werewolf-2",
  "villager-1",
  "villager-2",
  "villager-3",
  "seer",
  "robber",
  "troublemaker",
  "insomniac",
  "drunk",
  "werewolf-seer",
  "witch",
  "doppelganger",
  "copycat",
];

function getDefaultRoleOptionIds(requiredRoleCount: number) {
  return BASIC_ROLE_OPTION_IDS.slice(0, requiredRoleCount);
}

function normalizeRoleOptionIds(optionIds: unknown) {
  if (!Array.isArray(optionIds)) {
    return [];
  }

  const normalizedOptionIds: string[] = [];

  for (const optionId of optionIds) {
    if (
      typeof optionId === "string" &&
      ROLE_OPTION_ID_SET.has(optionId) &&
      !normalizedOptionIds.includes(optionId)
    ) {
      normalizedOptionIds.push(optionId);
    }
  }

  return normalizedOptionIds;
}

function fitRoleOptionIds(optionIds: string[], requiredRoleCount: number) {
  const selectedOptionIds = normalizeRoleOptionIds(optionIds).slice(0, requiredRoleCount);

  if (selectedOptionIds.length >= requiredRoleCount) {
    return selectedOptionIds;
  }

  for (const optionId of getDefaultRoleOptionIds(BASIC_ROLE_OPTION_IDS.length)) {
    if (!selectedOptionIds.includes(optionId)) {
      selectedOptionIds.push(optionId);
    }

    if (selectedOptionIds.length >= requiredRoleCount) {
      break;
    }
  }

  return selectedOptionIds;
}

function readStoredRoleOptionIds(requiredRoleCount: number) {
  try {
    return fitRoleOptionIds(
      JSON.parse(window.localStorage.getItem(STORED_ROLE_OPTION_IDS_KEY) ?? "[]"),
      requiredRoleCount
    );
  } catch {
    return getDefaultRoleOptionIds(requiredRoleCount);
  }
}

function saveStoredRoleOptionIds(optionIds: string[]) {
  try {
    window.localStorage.setItem(STORED_ROLE_OPTION_IDS_KEY, JSON.stringify(normalizeRoleOptionIds(optionIds)));
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

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
  const [guestAvatarObjectKey, setGuestAvatarObjectKey] = useState<string | null>(null);
  const [guestAvatarObjectKeyInput, setGuestAvatarObjectKeyInput] = useState<string | null>(null);
  const [guestNameError, setGuestNameError] = useState("");
  const [shouldJoinAfterGuestName, setShouldJoinAfterGuestName] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isRoleSetupOpen, setIsRoleSetupOpen] = useState(false);
  const [selectedRoleOptionIds, setSelectedRoleOptionIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const currentPlayer = lobbyState.players.find(
    (player) => player.id === lobbyState.currentPlayerId
  );
  const isCurrentPlayerHost = Boolean(currentPlayer?.isHost);
  const allPlayersReady =
    lobbyState.players.length >= 3 && lobbyState.players.every((player) => player.isReady);
  const requiredRoleCount = lobbyState.players.length + 3;
  const selectedRoles = selectedRoleOptionIds
    .map((optionId) => ROLE_LABEL_OPTIONS.find((option) => option.id === optionId)?.role)
    .filter(Boolean) as WolfRole[];
  const selectedRoleTotal = selectedRoles.length;
  const shouldShowRoleSetup = isRoleSetupOpen && isCurrentPlayerHost && allPlayersReady;

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
      const savedGuestAvatarObjectKey = readStoredGuestPlayerAvatarObjectKey();
      const hasSession = isAllowedGmailSession(data.session);

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
      setGuestAvatarObjectKey(savedGuestAvatarObjectKey);
      setGuestAvatarObjectKeyInput(savedGuestAvatarObjectKey);
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
      setIsLoggedIn(isAllowedGmailSession(session));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  function getCurrentPlayerName() {
    if (isLoggedIn) {
      return readStoredAccountProfile()?.displayName.trim() || undefined;
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
      return readStoredAccountProfile()?.avatarKey;
    }

    return guestAvatarKey;
  }

  function getCurrentPlayerAvatarObjectKey() {
    if (isLoggedIn) {
      return readStoredAccountProfile()?.avatarObjectKey ?? undefined;
    }

    return guestAvatarObjectKey;
  }

  function runJoinCurrentRoom(playerName?: string, avatarKey?: string, avatarObjectKey?: string | null) {
    setErrorMessage("");
    startTransition(async () => {
      const result = await joinWolfRoom(lobbyState.room.code, playerName, avatarKey, avatarObjectKey);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      setLobbyState((currentState) => ({
        ...currentState,
        players: currentState.players.some((player) => player.id === result.playerId)
          ? currentState.players.map((player) =>
              player.id === result.playerId
                ? {
                    ...player,
                    name: result.playerName,
                    avatarKey: result.playerAvatarKey,
                    avatarObjectKey: result.playerAvatarObjectKey,
                    avatarUrl: result.playerAvatarUrl,
                  }
                : player
            )
          : [
              ...currentState.players,
              {
                id: result.playerId,
                name: result.playerName,
                avatarKey: result.playerAvatarKey,
                avatarObjectKey: result.playerAvatarObjectKey,
                avatarUrl: result.playerAvatarUrl,
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
    }
  }

  function joinCurrentRoom() {
    const playerName = ensurePlayerIdentity();

    if (playerName === null) {
      return;
    }

    runJoinCurrentRoom(playerName, getCurrentPlayerAvatarKey(), getCurrentPlayerAvatarObjectKey());
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

  function toggleSelectedRole(optionId: string) {
    setSelectedRoleOptionIds((currentOptionIds) => {
      let nextOptionIds: string[];

      if (currentOptionIds.includes(optionId)) {
        nextOptionIds = currentOptionIds.filter((currentOptionId) => currentOptionId !== optionId);
      } else if (currentOptionIds.length >= requiredRoleCount) {
        nextOptionIds = currentOptionIds;
      } else {
        nextOptionIds = [...currentOptionIds, optionId];
      }

      saveStoredRoleOptionIds(nextOptionIds);
      return nextOptionIds;
    });
  }

  function openRoleSetup() {
    setErrorMessage("");

    if (!allPlayersReady) {
      setErrorMessage("Cần tất cả người chơi sẵn sàng trước khi chọn role.");
      return;
    }

    setIsRoleSetupOpen(true);
    setSelectedRoleOptionIds(readStoredRoleOptionIds(requiredRoleCount));
  }

  function startGame() {
    setErrorMessage("");

    if (selectedRoleTotal !== requiredRoleCount) {
      setErrorMessage(`Cần chọn đúng ${requiredRoleCount} lá cho ${lobbyState.players.length} người chơi.`);
      return;
    }

    startTransition(async () => {
      saveStoredRoleOptionIds(selectedRoleOptionIds);
      const result = await startWolfGame(lobbyState.room.code, selectedRoles);

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
    <main className={`${styles.page} ${styles.roomPage} ${styles.classicWolfTheme}`}>
      <section className={styles.roomPanel}>
        <p className={styles.eyebrow}>Phòng chờ</p>

        {shouldShowRoleSetup ? (
          <div className={styles.roleSetup}>
            <div className={styles.roleSetupHeader}>
              <div>
                <span>Chọn role</span>
                <strong>{selectedRoleTotal}/{requiredRoleCount} lá</strong>
              </div>
              <p>{lobbyState.players.length} người chơi</p>
            </div>

            <div className={styles.roleSetupGrid}>
              {ROLE_LABEL_GROUPS.map((group) => (
                <div className={styles.roleBadgeRow} key={group.id}>
                  {group.options.map((option) => {
                    const isDeckFull = selectedRoleTotal >= requiredRoleCount;
                    const isSelected = selectedRoleOptionIds.includes(option.id);

                    return (
                      <button
                        className={`${styles.roleBadge} ${isSelected ? styles.roleBadgeActive : ""}`}
                        type="button"
                        disabled={isPending || (!isSelected && isDeckFull)}
                        key={option.id}
                        onClick={() => toggleSelectedRole(option.id)}
                      >
                        <strong>{WOLF_ROLE_LABELS[option.role]}</strong>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {errorMessage && <p className={styles.inlineError}>{errorMessage}</p>}

            <div className={styles.actions}>
              <button
                className={`${styles.primaryButton} ${styles.successButton}`}
                type="button"
                disabled={isPending || selectedRoleTotal !== requiredRoleCount}
                onClick={startGame}
              >
                <Play aria-hidden="true" />
                Bắt đầu chơi
              </button>
              <button
                className={styles.ghostButton}
                type="button"
                disabled={isPending}
                onClick={() => setIsRoleSetupOpen(false)}
              >
                Quay lại
              </button>
            </div>
          </div>
        ) : (
          <>
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
                  src={getPlayerAvatarSrc(player.avatarKey, player.avatarUrl)}
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

          {currentPlayer && (
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
              onClick={openRoleSetup}
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
          </>
        )}
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
                className={styles.exitButton}
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
                <Link
                  className={styles.primaryButton}
                  href={buildAuthPath("/auth/sign-in", `/games/wolf/rooms/${lobbyState.room.code}`)}
                >
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
                  selectedAvatarObjectKey={guestAvatarObjectKeyInput}
                  onSelectAvatar={setGuestAvatarInput}
                  onSelectAvatarObjectKey={setGuestAvatarObjectKeyInput}
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
