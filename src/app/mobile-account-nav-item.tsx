"use client";

import { CircleUserRound, LogIn, PencilLine, UserPlus } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  MAX_GUEST_PLAYER_NAME_LENGTH,
  readStoredGuestPlayerName,
  saveStoredGuestPlayerName,
} from "@/lib/guest-player";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./page.module.css";

export default function MobileAccountNavItem() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState("");

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) {
          return;
        }

        setIsLoggedIn(Boolean(session));

        if (session) {
          setIsRenameOpen(false);
        }
      });

      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (isMounted) {
            setIsLoggedIn(Boolean(data.session));
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsLoggedIn(false);
          }
        });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch {
      queueMicrotask(() => {
        if (isMounted) {
          setIsLoggedIn(false);
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

  return (
    <div className={styles.mobileAccountWrapper}>
      <button
        className={styles.mobileAccountButton}
        type="button"
        aria-expanded={isOpen}
        aria-label="Tài khoản"
        onClick={() => setIsOpen((current) => !current)}
      >
        <CircleUserRound aria-hidden="true" />
        <span>Tài khoản</span>
      </button>

      {isOpen && (
        <div className={styles.mobileAccountPanel}>
          {isLoggedIn === false && (
            <>
              <Link
                className={styles.mobileAccountLink}
                href="#login"
                onClick={() => setIsOpen(false)}
              >
                <LogIn aria-hidden="true" />
                Đăng nhập
              </Link>
              <Link
                className={styles.mobileAccountPrimaryLink}
                href="#signup"
                onClick={() => setIsOpen(false)}
              >
                <UserPlus aria-hidden="true" />
                Đăng ký
              </Link>
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

          {isLoggedIn === false && isRenameOpen && (
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
