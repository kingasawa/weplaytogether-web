"use client";

import type { Session } from "@supabase/supabase-js";
import { CircleUserRound, IdCard, LogIn, LogOut, PencilLine, UserPlus } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PlayerAvatarImage } from "@/components/ui/player-avatar-image";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import {
  getAuthDisplayName,
  getCurrentAuthNextPath,
  getGmailAvatarUrl,
  isAllowedGmailSession,
  signInWithGmail,
  signOutFromSupabase,
} from "@/lib/supabase/auth-client";
import { getPlayerAvatarSrc, getUploadedPlayerAvatarUrl } from "@/lib/player-avatars";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readStoredAccountProfile, type StoredAccountProfile } from "@/lib/user-profile";
import styles from "./page.module.css";

export default function MobileAccountNavItem() {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthPending, setIsAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState("");
  const [accountProfile, setAccountProfile] = useState<StoredAccountProfile | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Đóng profile menu khi bấm ra ngoài hoặc nhấn Escape.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = createSupabaseBrowserClient();

      async function applySession(nextSession: Session | null) {
        if (nextSession && !isAllowedGmailSession(nextSession)) {
          await supabase.auth.signOut();
          nextSession = null;

          if (isMounted) {
            setAuthError("Chỉ hỗ trợ đăng nhập bằng Google.");
          }
        }

        if (!isMounted) {
          return;
        }

        setSession(nextSession);
        setAccountProfile(nextSession ? readStoredAccountProfile() : null);
        setIsAuthReady(true);

        if (nextSession) {
          setIsRenameOpen(false);
        }
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        void applySession(session);
      });

      supabase.auth
        .getSession()
        .then(({ data }) => {
          void applySession(data.session);
        })
        .catch(() => {
          if (isMounted) {
            setSession(null);
            setIsAuthReady(true);
          }
        });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        if (isMounted) {
          setSession(null);
          setIsAuthReady(true);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const openRenameForm = () => {
    const savedGuestName = readStoredGuestPlayerName();

    setGuestNameInput(savedGuestName);
    setGuestNameError("");
    setIsRenameOpen(true);
  };

  const saveGuestName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedGuestName = guestNameInput
      .trim()
      .slice(0, MAX_GUEST_PLAYER_NAME_LENGTH);

    if (!normalizedGuestName) {
      setGuestNameError("Nhập tên để lưu lại.");
      return;
    }

    saveStoredGuestPlayerName(normalizedGuestName);
    setGuestNameInput(normalizedGuestName);
    setGuestNameError("");
    setIsRenameOpen(false);
  };

  const startGmailAuth = async () => {
    setAuthError("");
    setIsAuthPending(true);

    const { error } = await signInWithGmail(getCurrentAuthNextPath());

    if (error) {
      setAuthError(error.message);
      setIsAuthPending(false);
    }
  };

  const signOut = async () => {
    setAuthError("");
    setIsAuthPending(true);

    const { error } = await signOutFromSupabase();

    if (error) {
      setAuthError(error.message);
    } else {
      setSession(null);
      setAccountProfile(null);
      setIsOpen(false);
    }

    setIsAuthPending(false);
  };

  const accountAvatarObjectUrl = getUploadedPlayerAvatarUrl(accountProfile?.avatarObjectKey);
  const accountAvatarSrc = session
    ? getPlayerAvatarSrc(accountProfile?.avatarKey, accountAvatarObjectUrl ?? getGmailAvatarUrl(session))
    : null;

  return (
    <div className={styles.mobileAccountWrapper} ref={wrapperRef}>
      <button
        className={styles.mobileAccountButton}
        type="button"
        aria-expanded={isOpen}
        aria-label="Tài khoản"
        onClick={() => {
          if (session) {
            setAccountProfile(readStoredAccountProfile());
          }

          setIsOpen((current) => !current);
        }}
      >
        {accountAvatarSrc ? (
          <PlayerAvatarImage
            alt=""
            aria-hidden="true"
            className={styles.mobileAccountAvatar}
            width={44}
            height={44}
            src={accountAvatarSrc}
            avatarKey={accountProfile?.avatarKey}
          />
        ) : (
          <CircleUserRound aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div className={styles.mobileAccountPanel}>
          {!isAuthReady && <span className={styles.mobileAccountStatus}>Đang kiểm tra...</span>}

          {isAuthReady && session && (
            <>
              <span className={styles.mobileAccountUser}>
                <CircleUserRound aria-hidden="true" />
                {getAuthDisplayName(session)}
              </span>
              <Link className={styles.mobileAccountLink} href="/profile" onClick={() => setIsOpen(false)}>
                <IdCard aria-hidden="true" />
                Hồ sơ người chơi
              </Link>
              <button
                className={`${styles.mobileAccountLink} ${styles.mobileAccountLinkDanger}`}
                type="button"
                disabled={isAuthPending}
                onClick={signOut}
              >
                <LogOut aria-hidden="true" />
                Đăng xuất
              </button>
            </>
          )}

          {isAuthReady && !session && (
            <>
              <button
                className={styles.mobileAccountLink}
                type="button"
                disabled={isAuthPending}
                onClick={startGmailAuth}
              >
                <LogIn aria-hidden="true" />
                Đăng nhập
              </button>
              <button
                className={styles.mobileAccountPrimaryLink}
                type="button"
                disabled={isAuthPending}
                onClick={startGmailAuth}
              >
                <UserPlus aria-hidden="true" />
                Đăng ký
              </button>
              <button
                className={styles.mobileAccountRenameButton}
                type="button"
                onClick={openRenameForm}
              >
                <PencilLine aria-hidden="true" />
                Đổi tên
              </button>
            </>
          )}

          {authError && <span className={styles.mobileAccountRenameError}>{authError}</span>}

          {isAuthReady && !session && isRenameOpen && (
            <form
              className={styles.mobileAccountRenameForm}
              onSubmit={saveGuestName}
            >
              <label htmlFor="mobile-account-guest-name">Tên khách</label>
              <input
                id="mobile-account-guest-name"
                maxLength={MAX_GUEST_PLAYER_NAME_LENGTH}
                placeholder="Nhập tên của bạn"
                value={guestNameInput}
                onChange={(event) => {
                  setGuestNameInput(event.target.value);
                  setGuestNameError("");
                }}
              />
              {guestNameError && (
                <span className={styles.mobileAccountRenameError}>
                  {guestNameError}
                </span>
              )}
              <button className={styles.mobileAccountSaveButton} type="submit">
                Lưu tên
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
