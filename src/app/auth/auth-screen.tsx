"use client";

import { CircleAlert, Gamepad2, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import {
  isAllowedGmailSession,
  signInWithGmail,
  signOutFromSupabase,
} from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./auth.module.css";

type AuthScreenProps = {
  mode: "sign-in" | "sign-up";
  nextPath: string;
};

export default function AuthScreen({ mode, nextPath }: AuthScreenProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const isSignUp = mode === "sign-up";
  const switchHref = useMemo(
    () => buildAuthPath(isSignUp ? "/auth/sign-in" : "/auth/sign-up", nextPath),
    [isSignUp, nextPath]
  );

  useEffect(() => {
    let isMounted = true;

    createSupabaseBrowserClient()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!isMounted || !data.session) {
          return;
        }

        if (isAllowedGmailSession(data.session)) {
          router.replace(nextPath);
          router.refresh();
          return;
        }

        await signOutFromSupabase();

        if (isMounted) {
          setErrorMessage("Chỉ hỗ trợ tài khoản Gmail có đuôi @gmail.com.");
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage("Không thể kiểm tra phiên đăng nhập.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [nextPath, router]);

  async function continueWithGmail() {
    setIsPending(true);
    setErrorMessage("");

    const { error } = await signInWithGmail(nextPath);

    if (error) {
      setErrorMessage(error.message);
      setIsPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <Link className={styles.brand} href="/" aria-label="Boardverse">
          <span className={styles.brandIcon}>
            <Gamepad2 aria-hidden="true" />
          </span>
          <span>
            <strong>BOARDVERSE</strong>
            <small>WE PLAY TOGETHER</small>
          </span>
        </Link>

        <div className={styles.heading}>
          <span>Gmail</span>
          <h1>{isSignUp ? "Đăng ký" : "Đăng nhập"}</h1>
          <p>Chỉ tài khoản Gmail được dùng để vào Boardverse.</p>
        </div>

        <button className={styles.gmailButton} type="button" disabled={isPending} onClick={continueWithGmail}>
          {isPending ? <LoaderCircle aria-hidden="true" /> : <Mail aria-hidden="true" />}
          {isPending ? "Đang chuyển..." : "Tiếp tục bằng Gmail"}
        </button>

        {errorMessage && (
          <p className={styles.errorText}>
            <CircleAlert aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        <p className={styles.switchText}>
          {isSignUp ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
          <Link href={switchHref}>{isSignUp ? "Đăng nhập" : "Đăng ký"}</Link>
        </p>

        <Link className={styles.secondaryLink} href={nextPath}>
          Quay lại
        </Link>
      </section>
    </main>
  );
}
