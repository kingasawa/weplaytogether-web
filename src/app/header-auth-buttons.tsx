"use client";

import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getAuthDisplayName,
  isAllowedGmailSession,
  signInWithGmail,
  signOutFromSupabase,
} from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./page.module.css";

export default function HeaderAuthButtons() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    async function applySession(nextSession: Session | null) {
      if (nextSession && !isAllowedGmailSession(nextSession)) {
        await supabase.auth.signOut();
        nextSession = null;
      }

      if (isMounted) {
        setSession(nextSession);
        setIsReady(true);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => {
        if (isMounted) {
          setSession(null);
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function startGmailAuth() {
    setIsPending(true);

    const { error } = await signInWithGmail("/");

    if (error) {
      setIsPending(false);
    }
  }

  async function signOut() {
    setIsPending(true);

    const { error } = await signOutFromSupabase();

    if (!error) {
      setSession(null);
    }

    setIsPending(false);
  }

  if (isReady && session) {
    return (
      <>
        <Link className={styles.accountBadge} href="/profile" title="Hồ sơ người chơi">
          {getAuthDisplayName(session)}
        </Link>
        <button className={styles.loginButton} type="button" disabled={isPending} onClick={signOut}>
          <LogOut aria-hidden="true" />
          Đăng xuất
        </button>
      </>
    );
  }

  return (
    <>
      <button className={styles.loginButton} type="button" disabled={isPending} onClick={startGmailAuth}>
        Đăng nhập
      </button>
      <button className={styles.signupButton} type="button" disabled={isPending} onClick={startGmailAuth}>
        Đăng ký
      </button>
    </>
  );
}
