"use client";

import {
  BookOpen,
  Globe2,
  LockKeyhole,
  LogIn,
  Play,
  Plus,
  RefreshCw,
  ShieldQuestion,
  UserRound,
  X,
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
import { DEFAULT_PLAYER_AVATAR_KEY, type PlayerAvatarKey } from "@/lib/player-avatars";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createWolfRoom,
  joinWolfRoom,
  listPublicWolfRooms,
  type WolfPublicRoomSummary,
} from "./actions";
import { PlayerAvatarPicker } from "./player-avatar-picker";
import styles from "./page.module.css";

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

export default function WolfGameScreen() {
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
  const [guestAvatarInput, setGuestAvatarInput] =
    useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [guestNameError, setGuestNameError] = useState("");
  const [pendingIdentityAction, setPendingIdentityAction] = useState<PendingIdentityAction>(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [actionError, setActionError] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<RoomVisibility>("public");
  const [publicRooms, setPublicRooms] = useState<WolfPublicRoomSummary[]>([]);
  const [publicRoomsError, setPublicRoomsError] = useState("");

  const normalizedRoomCode = useMemo(
    () => normalizeRoomCodeInput(roomCode),
    [roomCode]
  );

  const loadPublicRooms = useCallback(() => {
    setPublicRoomsError("");
    startRoomListTransition(async () => {
      const result = await listPublicWolfRooms();

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
      const hasSession = Boolean(session);

      setIsLoggedIn(hasSession);
      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setGuestAvatarKey(savedGuestAvatarKey);
      setGuestAvatarInput(savedGuestAvatarKey);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  function getCurrentPlayerName() {
    if (isLoggedIn) {
      return undefined;
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
    if (isLoggedIn) {
      return undefined;
    }

    return guestAvatarKey;
  }

  function runCreateRoom(playerName?: string, avatarKey?: string, isPublic = true) {
    setActionError("");
    startTransition(async () => {
      const result = await createWolfRoom(playerName, avatarKey, isPublic);

      if (!result.ok) {
        setActionError(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}`);
    });
  }

  function runJoinRoom(playerName?: string, avatarKey?: string, roomCodeToJoin = normalizedRoomCode) {
    const codeToJoin = normalizeRoomCodeInput(roomCodeToJoin);

    if (!ROOM_ID_PATTERN.test(codeToJoin)) {
      setRoomCodeError("Mã phòng phải gồm đúng 4 chữ cái từ a đến z.");
      return;
    }

    setRoomCodeError("");
    startTransition(async () => {
      const result = await joinWolfRoom(codeToJoin, playerName, avatarKey);

      if (!result.ok) {
        setRoomCodeError(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}`);
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

    const nextAction = pendingIdentityAction;
    setPendingIdentityAction(null);

    if (nextAction === "create_room") {
      runCreateRoom(normalizedGuestName, savedAvatarKey, roomVisibility === "public");
    }

    if (nextAction === "open_create_room") {
      setIsCreateOpen(true);
    }

    if (nextAction === "open_join_room") {
      setIsJoinOpen(true);
      loadPublicRooms();
    }

    if (nextAction === "join_room") {
      runJoinRoom(normalizedGuestName, savedAvatarKey);
    }
  }

  function openCreateRoom() {
    const playerName = ensurePlayerIdentity("open_create_room");

    if (playerName === null) {
      return;
    }

    setActionError("");
    setIsCreateOpen(true);
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerName = ensurePlayerIdentity("create_room");

    if (playerName === null) {
      return;
    }

    runCreateRoom(playerName, getCurrentPlayerAvatarKey(), roomVisibility === "public");
  }

  function openJoinRoom() {
    if (ensurePlayerIdentity("open_join_room") === null) {
      return;
    }

    setIsJoinOpen(true);
    loadPublicRooms();
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerName = ensurePlayerIdentity("join_room");

    if (playerName === null) {
      return;
    }

    runJoinRoom(playerName, getCurrentPlayerAvatarKey());
  }

  function joinPublicRoom(publicRoomCode: string) {
    setRoomCode(publicRoomCode);
    setRoomCodeError("");
    const playerName = ensurePlayerIdentity("join_room");

    if (playerName === null) {
      return;
    }

    runJoinRoom(playerName, getCurrentPlayerAvatarKey(), publicRoomCode);
  }

  function updateRoomCode(value: string) {
    setRoomCode(value);
    setRoomCodeError("");
  }

  function openGuestProfileEditor() {
    setPendingIdentityAction(null);
    setGuestNameInput(guestName);
    setGuestAvatarInput(guestAvatarKey);
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
    <main className={`${styles.page} ${styles.classicWolfTheme}`}>
      <section className={styles.hero}>
        <div className={styles.heroImage}>
          <Image
            alt="Banner game Ma Sói Một Đêm"
            fill
            priority
            sizes="100vw"
            src="/images/ui/wolf_game_bg.png"
          />
        </div>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <ShieldQuestion aria-hidden="true" />
            Suy luận xã hội
          </p>
          <p className={styles.heroTitle}>Ma Sói Một Đêm</p>
          <p className={styles.description}>
            Một đêm, nhiều vai trò, rất ít thời gian để thuyết phục mọi người tin
            bạn.
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
            <h2 id="create-room-title">Tạo phòng</h2>
            <form className={styles.createRoomForm} onSubmit={createRoom}>
              <div
                className={styles.visibilityToggle}
                role="group"
                aria-label="Chọn chế độ phòng"
              >
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
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="join-room-title"
            aria-modal="true"
            className={`${styles.modal} ${styles.joinRoomModal}`}
            role="dialog"
          >
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Đóng nhập mã phòng"
              onClick={() => setIsJoinOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <h2 id="join-room-title">Tham gia phòng</h2>
            <p>Chọn phòng public đang mở hoặc nhập mã phòng.</p>
            <div className={styles.publicRoomsPanel}>
              <div className={styles.publicRoomsHeader}>
                <h3>Phòng public</h3>
                <button
                  className={styles.smallButton}
                  type="button"
                  disabled={isRoomListPending}
                  onClick={loadPublicRooms}
                >
                  <RefreshCw aria-hidden="true" />
                  {isRoomListPending ? "ĐANG TẢI" : "LÀM MỚI"}
                </button>
              </div>

              {publicRoomsError && <span className={styles.errorText}>{publicRoomsError}</span>}

              {!publicRoomsError && isRoomListPending && publicRooms.length === 0 && (
                <p className={styles.publicRoomsEmpty}>Đang tải phòng public...</p>
              )}

              {!publicRoomsError && !isRoomListPending && publicRooms.length === 0 && (
                <p className={styles.publicRoomsEmpty}>Chưa có phòng public đang mở.</p>
              )}

              {publicRooms.length > 0 && (
                <table className={styles.publicRoomTable}>
                  <thead>
                    <tr>
                      <th scope="col">Mã phòng</th>
                      <th scope="col">Host</th>
                      <th scope="col">Người chơi</th>
                      <th scope="col">Vào</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicRooms.map((room) => (
                      <tr key={room.code}>
                        <td data-label="Mã phòng">
                          <strong>{room.code.toUpperCase()}</strong>
                        </td>
                        <td data-label="Host">{room.hostName}</td>
                        <td data-label="Người chơi">
                          {room.playerCount}/{room.maxPlayers}
                        </td>
                        <td data-label="Vào">
                          <button
                            className={styles.smallButton}
                            type="button"
                            disabled={isPending || room.playerCount >= room.maxPlayers}
                            onClick={() => joinPublicRoom(room.code)}
                          >
                            <Play aria-hidden="true" />
                            {room.playerCount >= room.maxPlayers ? "ĐẦY" : "VÀO"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <form className={styles.joinForm} onSubmit={joinRoom}>
              <label htmlFor="wolf-room-code">Mã phòng</label>
              <input
                autoFocus
                id="wolf-room-code"
                inputMode="text"
                maxLength={4}
                pattern="[a-zA-Z]{4}"
                placeholder="abcd"
                type="text"
                value={normalizedRoomCode}
                onChange={(event) => updateRoomCode(event.target.value)}
              />
              {roomCodeError && <span className={styles.errorText}>{roomCodeError}</span>}
              <button className={styles.primaryButton} type="submit" disabled={isPending}>
                <Play aria-hidden="true" />
                {isPending ? "ĐANG VÀO..." : "VÀO PHÒNG"}
              </button>
            </form>
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
            aria-labelledby="identity-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="identity-title">
              {isEditingGuestProfile ? "Tên & avatar" : "Bạn chưa đăng nhập"}
            </h2>
            <p>
              {isEditingGuestProfile
                ? "Thiết lập tên và avatar trước khi tạo hoặc tham gia phòng."
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
                <label htmlFor="wolf-guest-name">Tên hiển thị</label>
                <input
                  autoFocus
                  id="wolf-guest-name"
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

      {isGuideOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="wolf-guide-title"
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
            <h2 id="wolf-guide-title">Hướng dẫn Ma Sói Một Đêm</h2>
            <ol className={styles.guideList}>
              <li>Mỗi người nhận một vai trò bí mật. Không tiết lộ vai của mình khi chưa đến lượt thảo luận.</li>
              <li>Ban đêm, các vai đặc biệt thực hiện hành động theo thứ tự của game.</li>
              <li>Ban ngày, cả phòng thảo luận để tìm ra Ma Sói hoặc bảo vệ phe của mình.</li>
              <li>Sau khi hết thời gian, mọi người bỏ phiếu. Kết quả thắng thua phụ thuộc vào vai bị treo.</li>
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}
