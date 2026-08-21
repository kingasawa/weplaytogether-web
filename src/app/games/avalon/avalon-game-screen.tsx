"use client";

import {
  BookOpen,
  Crown,
  Globe2,
  LockKeyhole,
  LogIn,
  Play,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerAvatarKey,
  readStoredGuestPlayerAvatarObjectKey,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerAvatarKey,
  saveStoredGuestPlayerAvatarObjectKey,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import { DEFAULT_PLAYER_AVATAR_KEY, type PlayerAvatarKey } from "@/lib/player-avatars";
import { isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readStoredAccountProfile } from "@/lib/user-profile";
import {
  createAvalonRoom,
  joinAvalonRoom,
  listPublicAvalonRooms,
  type AvalonPublicRoomSummary,
} from "./actions";
import { JoinRoomModal } from "../wolf/join-room-modal";
import { PlayerAvatarPicker } from "../wolf/player-avatar-picker";
import styles from "../wolf/page.module.css";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

type PendingIdentityAction =
  | "create_room"
  | "open_create_room"
  | "open_join_room"
  | "join_room"
  | null;

type RoomVisibility = "public" | "private";

function normalizeRoomCodeInput(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 4);
}

export default function AvalonGameScreen() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRoomListPending, startRoomListTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestAvatarKey, setGuestAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarInput, setGuestAvatarInput] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestAvatarObjectKey, setGuestAvatarObjectKey] = useState<string | null>(null);
  const [guestAvatarObjectKeyInput, setGuestAvatarObjectKeyInput] = useState<string | null>(null);
  const [guestNameError, setGuestNameError] = useState("");
  const [pendingIdentityAction, setPendingIdentityAction] = useState<PendingIdentityAction>(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [actionError, setActionError] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<RoomVisibility>("public");
  const [publicRooms, setPublicRooms] = useState<AvalonPublicRoomSummary[]>([]);
  const [publicRoomsError, setPublicRoomsError] = useState("");

  const normalizedRoomCode = useMemo(() => normalizeRoomCodeInput(roomCode), [roomCode]);

  const loadPublicRooms = useCallback(() => {
    setPublicRoomsError("");
    startRoomListTransition(async () => {
      const result = await listPublicAvalonRooms();

      if (!result.ok) {
        setPublicRooms([]);
        setPublicRoomsError(result.error);
        return;
      }

      setPublicRooms(result.rooms);
    });
  }, [startRoomListTransition]);

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

      setIsLoggedIn(isAllowedGmailSession(session));
      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
      setGuestAvatarObjectKey(savedGuestAvatarObjectKey);
      setGuestAvatarObjectKeyInput(savedGuestAvatarObjectKey);
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

  function ensurePlayerIdentity(nextAction: Exclude<PendingIdentityAction, null>) {
    const playerName = getCurrentPlayerName();

    if (playerName === null) {
      setPendingIdentityAction(nextAction);
      setIsIdentityOpen(true);
      setIsGuestFormOpen(true);
      return null;
    }

    return playerName;
  }

  function getCurrentPlayerAvatarKey() {
    return isLoggedIn ? readStoredAccountProfile()?.avatarKey : guestAvatarKey;
  }

  function getCurrentPlayerAvatarObjectKey() {
    return isLoggedIn ? readStoredAccountProfile()?.avatarObjectKey ?? null : guestAvatarObjectKey;
  }

  function runCreateRoom(
    playerName?: string,
    avatarKey?: string,
    isPublic = true,
    avatarObjectKey?: string | null
  ) {
    setActionError("");
    startTransition(async () => {
      const result = await createAvalonRoom(playerName, avatarKey, isPublic, avatarObjectKey);

      if (!result.ok) {
        setActionError(result.error);
        return;
      }

      router.push(`/games/avalon/rooms/${result.roomCode}`);
    });
  }

  function runJoinRoom(
    playerName?: string,
    avatarKey?: string,
    roomCodeToJoin = normalizedRoomCode,
    avatarObjectKey?: string | null
  ) {
    const codeToJoin = normalizeRoomCodeInput(roomCodeToJoin);

    if (!ROOM_ID_PATTERN.test(codeToJoin)) {
      setRoomCodeError("Mã phòng phải gồm đúng 4 chữ cái từ a đến z.");
      return;
    }

    setRoomCodeError("");
    startTransition(async () => {
      const result = await joinAvalonRoom(codeToJoin, playerName, avatarKey, avatarObjectKey);

      if (!result.ok) {
        setRoomCodeError(result.error);
        return;
      }

      router.push(`/games/avalon/rooms/${result.roomCode}`);
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

    const nextAction = pendingIdentityAction;
    setPendingIdentityAction(null);

    if (nextAction === "create_room") {
      runCreateRoom(normalizedGuestName, savedAvatarKey, roomVisibility === "public", savedAvatarObjectKey);
    }

    if (nextAction === "open_create_room") {
      setIsCreateOpen(true);
    }

    if (nextAction === "open_join_room") {
      setIsJoinOpen(true);
      loadPublicRooms();
    }

    if (nextAction === "join_room") {
      runJoinRoom(normalizedGuestName, savedAvatarKey, normalizedRoomCode, savedAvatarObjectKey);
    }
  }

  function openCreateRoom() {
    const playerName = ensurePlayerIdentity("open_create_room");

    if (playerName !== null) {
      setActionError("");
      setIsCreateOpen(true);
    }
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerName = ensurePlayerIdentity("create_room");

    if (playerName !== null) {
      runCreateRoom(
        playerName,
        getCurrentPlayerAvatarKey(),
        roomVisibility === "public",
        getCurrentPlayerAvatarObjectKey()
      );
    }
  }

  function openJoinRoom() {
    setActionError("");
    router.push("/games/avalon/join");
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerName = ensurePlayerIdentity("join_room");

    if (playerName !== null) {
      runJoinRoom(playerName, getCurrentPlayerAvatarKey(), normalizedRoomCode, getCurrentPlayerAvatarObjectKey());
    }
  }

  function joinPublicRoom(publicRoomCode: string) {
    setRoomCode(publicRoomCode);
    setRoomCodeError("");
    const playerName = ensurePlayerIdentity("join_room");

    if (playerName !== null) {
      runJoinRoom(playerName, getCurrentPlayerAvatarKey(), publicRoomCode, getCurrentPlayerAvatarObjectKey());
    }
  }

  function openGuestProfileEditor() {
    setPendingIdentityAction(null);
    setGuestNameInput(guestName);
    setGuestAvatarInput(guestAvatarKey);
    setGuestAvatarObjectKeyInput(guestAvatarObjectKey);
    setGuestNameError("");
    setIsIdentityOpen(true);
    setIsGuestFormOpen(true);
  }

  function closeIdentityModal() {
    setIsIdentityOpen(false);
    setIsGuestFormOpen(false);
    setPendingIdentityAction(null);
  }

  const isEditingGuestProfile = isGuestFormOpen && pendingIdentityAction === null;

  return (
    <main className={`${styles.page} ${styles.classicWolfTheme} ${styles.avalonTheme}`}>
      <section className={styles.hero}>
        <div className={styles.heroImage}>
          <Image
            alt="Banner game Avalon"
            fill
            preload
            sizes="100vw"
            src="/images/boards/avalon.png"
          />
        </div>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <Crown aria-hidden="true" />
            Suy luận xã hội
          </p>
          <p className={styles.heroTitle}>Avalon</p>
          <p className={styles.description}>
            Chọn đội, vote công khai, đi quest bí mật và bảo vệ Merlin khỏi Assassin.
          </p>

          <div className={styles.actions} aria-label="Hành động chính">
            <button
              className={`${styles.secondaryButton} ${styles.createRoomButton}`}
              type="button"
              disabled={isPending}
              onClick={openCreateRoom}
            >
              <Plus aria-hidden="true" />
              {isPending ? "ĐANG TẠO..." : "TẠO PHÒNG"}
            </button>
            <button
              className={`${styles.primaryButton} ${styles.joinRoomButton}`}
              type="button"
              disabled={isPending}
              onClick={openJoinRoom}
            >
              <Play aria-hidden="true" />
              THAM GIA
            </button>
            {!isLoggedIn && (
              <button
                className={`${styles.ghostButton} ${styles.profileButton} ${styles.profileImageButton}`}
                type="button"
                onClick={openGuestProfileEditor}
              >
                <UserRound aria-hidden="true" />
                TÊN & AVATAR
              </button>
            )}
          </div>
          {actionError && <p className={styles.inlineError}>{actionError}</p>}
        </div>
      </section>

      <div className={styles.exitBar}>
        <Link className={`${styles.exitButton} ${styles.homeExitButton}`} href="/">
          THOÁT
        </Link>
        <button className={styles.ghostButton} type="button" onClick={() => setIsGuideOpen(true)}>
          <BookOpen aria-hidden="true" />
          HƯỚNG DẪN
        </button>
      </div>

      {isCreateOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="create-room-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Đóng tạo phòng"
              onClick={() => setIsCreateOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="create-room-title">Tạo phòng Avalon</h2>
            <form className={styles.createRoomForm} onSubmit={createRoom}>
              <div className={styles.visibilityToggle} role="group" aria-label="Chọn chế độ phòng">
                <button
                  className={`${styles.visibilityOption} ${
                    roomVisibility === "public" ? styles.visibilityOptionActive : ""
                  }`}
                  type="button"
                  aria-pressed={roomVisibility === "public"}
                  onClick={() => setRoomVisibility("public")}
                >
                  <Globe2 aria-hidden="true" />
                  <span>
                    <strong>Public</strong>
                    <small>Hiện trong danh sách</small>
                  </span>
                </button>
                <button
                  className={`${styles.visibilityOption} ${
                    roomVisibility === "private" ? styles.visibilityOptionActive : ""
                  }`}
                  type="button"
                  aria-pressed={roomVisibility === "private"}
                  onClick={() => setRoomVisibility("private")}
                >
                  <LockKeyhole aria-hidden="true" />
                  <span>
                    <strong>Private</strong>
                    <small>Chỉ vào bằng mã</small>
                  </span>
                </button>
              </div>
              {actionError && <span className={styles.errorText}>{actionError}</span>}
              <button className={styles.secondaryButton} type="submit" disabled={isPending}>
                <Plus aria-hidden="true" />
                {isPending ? "ĐANG TẠO..." : "TẠO PHÒNG"}
              </button>
            </form>
          </section>
        </div>
      )}

      {isJoinOpen && (
        <JoinRoomModal
          backgroundSrc="/images/boards/avalon.png"
          backgroundAlt="Ảnh nền phòng Avalon"
          roomCode={normalizedRoomCode}
          roomCodeError={roomCodeError}
          isPending={isPending}
          publicRooms={publicRooms}
          publicRoomsError={publicRoomsError}
          isRoomListPending={isRoomListPending}
          onClose={() => setIsJoinOpen(false)}
          onRoomCodeChange={(value) => {
            setRoomCode(value);
            setRoomCodeError("");
          }}
          onSubmitJoin={joinRoom}
          onRefreshPublicRooms={loadPublicRooms}
          onJoinPublicRoom={joinPublicRoom}
        />
      )}

      {isIdentityOpen && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeIdentityModal}>
          <section
            aria-labelledby="identity-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="identity-title">{isEditingGuestProfile ? "Tên & avatar" : "Bạn chưa đăng nhập"}</h2>
            <p>
              {isEditingGuestProfile
                ? "Thiết lập tên và avatar trước khi tạo hoặc tham gia phòng."
                : "Bạn có muốn đăng nhập không, hoặc chơi nhanh với vai trò khách?"}
            </p>

            {!isEditingGuestProfile && (
              <div className={styles.identityActions}>
                <Link className={styles.primaryButton} href={buildAuthPath("/auth/sign-in", "/games/avalon")}>
                  <LogIn aria-hidden="true" />
                  ĐĂNG NHẬP
                </Link>
                <button className={styles.secondaryButton} type="button" onClick={() => setIsGuestFormOpen(true)}>
                  <UserRound aria-hidden="true" />
                  CHƠI VỚI VAI TRÒ KHÁCH
                </button>
              </div>
            )}

            {isGuestFormOpen && (
              <form className={styles.guestForm} onSubmit={saveGuestName}>
                <label htmlFor="avalon-guest-name">Tên hiển thị</label>
                <input
                  autoFocus
                  id="avalon-guest-name"
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

      {isGuideOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="avalon-guide-title"
            aria-modal="true"
            className={`${styles.modal} ${styles.guideModal}`}
            role="dialog"
          >
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Đóng hướng dẫn"
              onClick={() => setIsGuideOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="avalon-guide-title">Hướng dẫn Avalon</h2>
            <ol className={styles.guideList}>
              <li>Good cần hoàn thành 3 quest. Evil thắng nếu 3 quest thất bại hoặc Assassin đoán đúng Merlin.</li>
              <li>Leader chọn đội đúng số người của quest. Cả bàn vote Approve hoặc Reject đội đó.</li>
              <li>Nếu đội được duyệt, thành viên trong đội đánh Success hoặc Fail bí mật. Good luôn phải đánh Success.</li>
              <li>Quest 4 ở bàn 7 người trở lên cần 2 lá Fail mới thất bại.</li>
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
