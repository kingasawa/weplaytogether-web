"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isAllowedGmailSession, signOutFromSupabase } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "../auth.module.css";

type AuthCallbackScreenProps = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  nextPath: string;
};

export default function AuthCallbackScreen({
  code,
  error,
  errorDescription,
  nextPath,
}: AuthCallbackScreenProps) {
  const router = useRouter();
  const hasHandledCallback = useRef(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Đang hoàn tất đăng nhập...");

  useEffect(() => {
    if (hasHandledCallback.current) {
      return;
    }

    hasHandledCallback.current = true;

    async function completeAuth() {
      try {
        if (error) {
          throw new Error(errorDescription || error);
        }

        const supabase = createSupabaseBrowserClient();

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!isAllowedGmailSession(data.session)) {
          await signOutFromSupabase();
          throw new Error("Chỉ hỗ trợ tài khoản Gmail có đuôi @gmail.com.");
        }

        setStatus("success");
        setMessage("Đăng nhập thành công.");
        router.replace(nextPath);
        router.refresh();
      } catch (callbackError) {
        setStatus("error");
        setMessage(callbackError instanceof Error ? callbackError.message : "Không thể hoàn tất đăng nhập.");
      }
    }

    void completeAuth();
  }, [code, error, errorDescription, nextPath, router]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.statusText}>
          {status === "loading" && <LoaderCircle aria-hidden="true" />}
          {status === "success" && <Check aria-hidden="true" />}
          {status === "error" && <CircleAlert aria-hidden="true" />}
          {message}
        </p>

        {status === "error" && (
          <Link className={styles.secondaryLink} href="/auth/sign-in">
            Thử lại
          </Link>
        )}
      </section>
    </main>
  );
}
