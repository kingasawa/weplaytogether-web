"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { DEFAULT_PLAYER_AVATAR_KEY, type PlayerAvatarKey } from "@/lib/player-avatars";
import { useWolfLobbyUpdates } from "@/lib/pusher/use-wolf-lobby-updates";
import { isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readStoredAccountProfile } from "@/lib/user-profile";
import RoomCodeJoinScreen from "./room-code-join-screen";
import RoomJoinScreen from "./room-join-screen";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type PublicRoomSummary = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
};

type PublicRoomsResult =
  | {
      ok: true;
      rooms: PublicRoomSummary[];
    }
  | {
      ok: false;
      error: string;
    };

type JoinRoomResult =
  | {
      ok: true;
      roomCode: string;
    }
  | {
      ok: false;
      error: string;
    };

type GameRoomCodeJoinClientProps = {
  gameName: string;
  gamePath: string;
  themeClassName: string;
  titleId: string;
  roomCodeInputId: string;
  guestNameInputId: string;
  gameBackgroundSrc: string;
  gameBackgroundAlt: string;
  listPublicRooms: () => Promise<PublicRoomsResult>;
  joinRoom: (
    roomCode: string,
    playerName?: string,
    avatarKey?: string,
    avatarObjectKey?: string | null
  ) => Promise<JoinRoomResult>;
};

function normalizeRoomCodeInput(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 4);
}

export default function GameRoomCodeJoinClient({
  gameName,
  gamePath,
  themeClassName,
  titleId,
  roomCodeInputId,
  guestNameInputId,
  gameBackgroundSrc,
  gameBackgroundAlt,
  listPublicRooms,
  joinRoom,
}: GameRoomCodeJoinClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRoomListPending, startRoomListTransition] = useTransition();
  const [isIdentityScreenOpen, setIsIdentityScreenOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestAvatarKey, setGuestAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarInput, setGuestAvatarInput] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarObjectKey, setGuestAvatarObjectKey] = useState<string | null>(null);
  const [guestAvatarObjectKeyInput, setGuestAvatarObjectKeyInput] = useState<string | null>(null);
  const [guestNameError, setGuestNameError] = useState("");
  const [pendingRoomCodeToJoin, setPendingRoomCodeToJoin] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [publicRoomsError, setPublicRoomsError] = useState("");

  const normalizedRoomCode = useMemo(() => normalizeRoomCodeInput(roomCode), [roomCode]);

  const applyPublicRoomsResult = useCallback((result: PublicRoomsResult) => {
    if (!result.ok) {
      setPublicRooms([]);
      setPublicRoomsError(result.error);
      return;
    }

    setPublicRoomsError("");
    setPublicRooms(result.rooms);
  }, []);

  const loadPublicRooms = useCallback(() => {
    setPublicRoomsError("");
    startRoomListTransition(async () => {
      applyPublicRoomsResult(await listPublicRooms());
    });
  }, [applyPublicRoomsResult, listPublicRooms, startRoomListTransition]);

  // Khi đang vào phòng thì ngừng cập nhật realtime: setState ưu tiên cao sẽ cắt ngang
  // transition đang chạy router.push và huỷ luôn điều hướng, khiến người chơi bị kẹt lại
  // ở màn hình /join dù đã vào phòng thành công.
  const isJoiningRef = useRef(false);

  // Realtime: cập nhật nền, không bật trạng thái "đang tải" để danh sách không nhấp nháy.
  const refreshPublicRoomsSilently = useCallback(async () => {
    if (isJoiningRef.current) {
      return;
    }

    const result = await listPublicRooms();

    if (isJoiningRef.current) {
      return;
    }

    applyPublicRoomsResult(result);
  }, [applyPublicRoomsResult, listPublicRooms]);

  useEffect(() => {
    loadPublicRooms();
  }, [loadPublicRooms]);

  useWolfLobbyUpdates({
    enabled: !isIdentityScreenOpen,
    onLobbyUpdate: refreshPublicRoomsSilently,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

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
      setIsLoggedIn(isAllowedGmailSession(data.session));
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
  }, []);

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
    return isLoggedIn ? readStoredAccountProfile()?.avatarObjectKey ?? undefined : guestAvatarObjectKey;
  }

  function requestIdentityForRoom(codeToJoin: string) {
    setPendingRoomCodeToJoin(codeToJoin);
    setGuestNameInput(guestName);
    setGuestAvatarInput(guestAvatarKey);
    setGuestAvatarObjectKeyInput(guestAvatarObjectKey);
    setGuestNameError("");
    setIsIdentityScreenOpen(true);
    setIsGuestFormOpen(true);
  }

  function runJoinRoom(
    roomCodeToJoin = normalizedRoomCode,
    playerName = getCurrentPlayerName(),
    avatarKey = getCurrentPlayerAvatarKey(),
    avatarObjectKey = getCurrentPlayerAvatarObjectKey()
  ) {
    const codeToJoin = normalizeRoomCodeInput(roomCodeToJoin);

    if (!ROOM_ID_PATTERN.test(codeToJoin)) {
      setRoomCodeError("Mã phòng phải gồm đúng 4 chữ cái từ a đến z.");
      return;
    }

    if (playerName === null) {
      setRoomCodeError("");
      requestIdentityForRoom(codeToJoin);
      return;
    }

    setRoomCodeError("");
    isJoiningRef.current = true;
    startTransition(async () => {
      const result = await joinRoom(codeToJoin, playerName, avatarKey, avatarObjectKey);

      if (!result.ok) {
        isJoiningRef.current = false;
        setRoomCodeError(result.error);
        setIsIdentityScreenOpen(false);
        return;
      }

      // Giữ nguyên cờ khi thành công: đang điều hướng sang phòng, không cập nhật gì thêm.
      router.push(`${gamePath}/rooms/${result.roomCode}`);
    });
  }

  function submitRoomCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runJoinRoom(normalizedRoomCode);
  }

  function joinPublicRoom(publicRoomCode: string) {
    setRoomCode(publicRoomCode);
    setRoomCodeError("");
    runJoinRoom(publicRoomCode);
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
    setIsIdentityScreenOpen(false);

    runJoinRoom(pendingRoomCodeToJoin, normalizedGuestName, savedAvatarKey, savedAvatarObjectKey);
  }

  if (isIdentityScreenOpen) {
    const signInNextPath = pendingRoomCodeToJoin
      ? `${gamePath}/rooms/${pendingRoomCodeToJoin}`
      : `${gamePath}/join`;

    return (
      <RoomJoinScreen
        gameName={gameName}
        roomCode={pendingRoomCodeToJoin}
        themeClassName={themeClassName}
        titleId={`${titleId}-identity`}
        signInHref={buildAuthPath("/auth/sign-in", signInNextPath)}
        guestNameInputId={guestNameInputId}
        isEditingGuestProfile={false}
        isGuestFormOpen={isGuestFormOpen}
        guestNameInput={guestNameInput}
        guestAvatarKey={guestAvatarInput}
        guestAvatarObjectKey={guestAvatarObjectKeyInput}
        guestNameError={guestNameError}
        backLabel="Quay lại"
        onBack={() => {
          setIsIdentityScreenOpen(false);
          setIsGuestFormOpen(false);
          setPendingRoomCodeToJoin("");
        }}
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
    <RoomCodeJoinScreen
      gameName={gameName}
      themeClassName={themeClassName}
      titleId={titleId}
      roomCodeInputId={roomCodeInputId}
      backgroundSrc={gameBackgroundSrc}
      backgroundAlt={gameBackgroundAlt}
      roomCode={normalizedRoomCode}
      roomCodeError={roomCodeError}
      publicRooms={publicRooms}
      publicRoomsError={publicRoomsError}
      isPending={isPending}
      isRoomListPending={isRoomListPending}
      onBack={() => router.push(gamePath)}
      onRefreshPublicRooms={loadPublicRooms}
      onJoinPublicRoom={joinPublicRoom}
      onRoomCodeChange={(value) => {
        setRoomCode(value);
        setRoomCodeError("");
      }}
      onSubmitRoomCode={submitRoomCode}
    />
  );
}
