"use client";

import type { Session } from "@supabase/supabase-js";
import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function getCurrentAuthNextPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function isAllowedGmailSession(session: Session | null) {
  if (!session?.user.email?.toLowerCase().endsWith("@gmail.com")) {
    return false;
  }

  const provider = session.user.app_metadata?.provider;
  const providers = session.user.app_metadata?.providers;

  return provider === "google" || (Array.isArray(providers) && providers.includes("google"));
}

export function getAuthDisplayName(session: Session | null) {
  const metadata = session?.user.user_metadata;
  const displayName =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : "";

  return displayName.trim() || session?.user.email || "Tài khoản";
}

export async function signInWithGmail(nextPath = getCurrentAuthNextPath()) {
  const redirectUrl = new URL("/auth/callback", window.location.origin);

  redirectUrl.searchParams.set("next", normalizeAuthNextPath(nextPath));

  return createSupabaseBrowserClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
      queryParams: {
        prompt: "select_account",
      },
    },
  });
}

export async function signOutFromSupabase() {
  return createSupabaseBrowserClient().auth.signOut();
}
