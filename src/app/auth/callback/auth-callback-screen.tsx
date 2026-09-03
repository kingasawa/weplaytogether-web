"use client";

import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/language-provider";
import { AUTH_NEXT_STORAGE_KEY, normalizeAuthNextPath } from "@/lib/auth-redirect";
import { isAllowedGmailSession, signOutFromSupabase } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureMyProfile } from "@/lib/user-profile";
import styles from "../auth.module.css";

type AuthCallbackScreenProps = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  nextPath: string | null;
};

function readStoredAuthNextPath() {
  try {
    return window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredAuthNextPath() {
  try {
    window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the session is already complete.
  }
}

export default function AuthCallbackScreen({
  code,
  error,
  errorDescription,
  nextPath,
}: AuthCallbackScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const hasHandledCallback = useRef(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState(t("auth.callback.loading"));

  useEffect(() => {
    if (hasHandledCallback.current) {
      return;
    }

    hasHandledCallback.current = true;

    async function completeAuth() {
      try {
        const redirectPath = normalizeAuthNextPath(nextPath ?? readStoredAuthNextPath());

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
          const detectedEmail = data.session?.user.email ?? t("auth.callback.noEmail");
          const detectedProvider =
            data.session?.user.app_metadata?.provider ?? t("auth.callback.unknownProvider");
          const detectedProviders = data.session?.user.app_metadata?.providers ?? [];
          console.warn(t("auth.callback.rejectedLog"), {
            email: detectedEmail,
            provider: detectedProvider,
            providers: detectedProviders,
            appMetadata: data.session?.user.app_metadata,
          });
          await signOutFromSupabase();
          throw new Error(
            t("auth.callback.googleOnlyWithAccount", {
              email: detectedEmail,
              provider: detectedProvider,
            })
          );
        }

        if (data.session) {
          await ensureMyProfile(data.session);
        }

        setStatus("success");
        setMessage(t("auth.callback.success"));
        clearStoredAuthNextPath();
        router.replace(redirectPath);
        router.refresh();
      } catch (callbackError) {
        setStatus("error");
        setMessage(callbackError instanceof Error ? callbackError.message : t("auth.callback.failed"));
      }
    }

    void completeAuth();
  }, [code, error, errorDescription, nextPath, router, t]);

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
            {t("auth.callback.retry")}
          </Link>
        )}
      </section>
    </main>
  );
}
