"use client";

import {
  BookOpen,
  LogIn,
  Play,
  Plus,
  ShieldQuestion,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createWolfRoom, joinWolfRoom } from "./actions";
import styles from "./page.module.css";

const ROOM_ID_PATTERN = /^[a-z]{4}$/;

export default function WolfGameScreen() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeError, setRoomCodeError] = useState("");
  const [actionError, setActionError] = useState("");

  const normalizedRoomCode = useMemo(
    () => roomCode.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 4),
    [roomCode]
  );

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      const savedGuestName = readStoredGuestPlayerName();
      const hasSession = Boolean(data.session);

      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setIsLoggedIn(hasSession);
      setIsIdentityOpen(!hasSession && !savedGuestName);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const savedGuestName = readStoredGuestPlayerName();
      const hasSession = Boolean(session);

      setIsLoggedIn(hasSession);
      setGuestName(savedGuestName);
      setGuestNameInput(savedGuestName);
      setIsIdentityOpen(!hasSession && !savedGuestName);
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

  function createRoom() {
    const playerName = ensurePlayerIdentity();

    if (playerName === null) {
      return;
    }

    setActionError("");
    startTransition(async () => {
      const result = await createWolfRoom(playerName);

      if (!result.ok) {
        setActionError(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}`);
    });
  }

  function openJoinRoom() {
    if (ensurePlayerIdentity() === null) {
      return;
    }

    setIsJoinOpen(true);
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const playerName = ensurePlayerIdentity();

    if (playerName === null) {
      return;
    }

    if (!ROOM_ID_PATTERN.test(normalizedRoomCode)) {
      setRoomCodeError("Mã phòng phải gồm đúng 4 chữ cái từ a đến z.");
      return;
    }

    setRoomCodeError("");
    startTransition(async () => {
      const result = await joinWolfRoom(normalizedRoomCode, playerName);

      if (!result.ok) {
        setRoomCodeError(result.error);
        return;
      }

      router.push(`/games/wolf/rooms/${result.roomCode}`);
    });
  }

  function updateRoomCode(value: string) {
    setRoomCode(value);
    setRoomCodeError("");
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroImage}>
          <Image
            alt="Banner game Ma Sói Một Đêm"
            fill
            priority
            sizes="100vw"
            src="/images/boards/wolf.png"
          />
        </div>

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <ShieldQuestion aria-hidden="true" />
            Suy luận xã hội
          </p>
          <h1>Ma Sói Một Đêm</h1>
          <p className={styles.description}>
            Một đêm, nhiều vai trò, rất ít thời gian để thuyết phục mọi người tin
            bạn. Tạo phòng riêng hoặc nhập mã để vào cùng nhóm bạn.
          </p>

          <div className={styles.actions} aria-label="Hành động chính">
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={isPending}
              onClick={createRoom}
            >
              <Plus aria-hidden="true" />
              {isPending ? "ĐANG TẠO..." : "TẠO PHÒNG"}
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isPending}
              onClick={openJoinRoom}
            >
              <Play aria-hidden="true" />
              THAM GIA PHÒNG
            </button>
            <button className={styles.ghostButton} type="button" onClick={() => setIsGuideOpen(true)}>
              <BookOpen aria-hidden="true" />
              HƯỚNG DẪN
            </button>
          </div>
          {actionError && <p className={styles.inlineError}>{actionError}</p>}
        </div>
      </section>

      <div className={styles.exitBar}>
        <Link className={styles.exitButton} href="/">
          THOÁT
        </Link>
      </div>

      {isJoinOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="join-room-title"
            aria-modal="true"
            className={styles.modal}
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
            <h2 id="join-room-title">Nhập mã phòng</h2>
            <p>Mã phòng gồm 4 chữ cái thường, ví dụ: abcd.</p>
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
          onClick={() => setIsIdentityOpen(false)}
        >
          <section
            aria-labelledby="identity-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="identity-title">Bạn chưa đăng nhập</h2>
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
