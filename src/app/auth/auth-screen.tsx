"use client";

import { CircleAlert, Gamepad2, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/i18n/language-provider";
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
  const { t } = useLanguage();
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
          setErrorMessage(t("auth.googleOnly"));
        }
      })
      .catch(() => {
        if (isMounted) {
          setErrorMessage(t("auth.checkSessionFailed"));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [nextPath, router, t]);

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
        <Link className={styles.brand} href="/" aria-label="WePlayTogether">
          <span className={styles.brandIcon}>
            <Gamepad2 aria-hidden="true" />
          </span>
          <span>
            <strong>BOARDVERSE</strong>
            <small>WE PLAY TOGETHER</small>
          </span>
        </Link>

        <div className={styles.heading}>
          <span>Google</span>
          <h1>{isSignUp ? t("auth.modeTitle.signUp") : t("auth.modeTitle.signIn")}</h1>
          <p>{t("auth.headingDescription")}</p>
        </div>

        <button className={styles.gmailButton} type="button" disabled={isPending} onClick={continueWithGmail}>
          {isPending ? <LoaderCircle aria-hidden="true" /> : <Mail aria-hidden="true" />}
          {isPending ? t("auth.redirecting") : t("auth.continueWithGoogle")}
        </button>

        {errorMessage && (
          <p className={styles.errorText}>
            <CircleAlert aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        <p className={styles.switchText}>
          {isSignUp ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
          <Link href={switchHref}>{isSignUp ? t("auth.signIn") : t("auth.signUp")}</Link>
        </p>

        <p className={styles.switchText}>
          {t("auth.agreement.prefix")} <Link href="/terms-of-service">{t("nav.terms")}</Link>{" "}
          {t("auth.agreement.middle")} <Link href="/privacy-policy">{t("nav.privacy")}</Link>.
        </p>

        <Link className={styles.secondaryLink} href={nextPath}>
          {t("auth.back")}
        </Link>
      </section>
    </main>
  );
}
