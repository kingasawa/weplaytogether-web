"use client";

import type { Session } from "@supabase/supabase-js";
import {
  AUTH_NEXT_STORAGE_KEY,
  buildAuthCallbackUrl,
  getRuntimeAuthOrigin,
  normalizeAuthNextPath,
} from "@/lib/auth-redirect";
import { normalizeGooglePlayerAvatarUrl } from "@/lib/player-avatars";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function getCurrentAuthNextPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function isAllowedGmailSession(session: Session | null) {
  // Cho phép mọi tài khoản đăng nhập qua Google (Gmail cá nhân lẫn Google Workspace),
  // không giới hạn đuôi @gmail.com.
  const provider = session?.user.app_metadata?.provider;
  const providers = session?.user.app_metadata?.providers;

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

export function getGmailAvatarUrl(session: Session | null) {
  const metadata = session?.user.user_metadata;
  const avatarUrl =
    typeof metadata?.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata?.picture === "string"
        ? metadata.picture
        : null;

  return normalizeGooglePlayerAvatarUrl(avatarUrl);
}

function rememberAuthNextPath(nextPath: string) {
  try {
    window.sessionStorage.setItem(AUTH_NEXT_STORAGE_KEY, nextPath);
  } catch {
    // Ignore storage failures; callback will fall back to the home page.
  }
}

export async function signInWithGmail(nextPath = getCurrentAuthNextPath()) {
  rememberAuthNextPath(normalizeAuthNextPath(nextPath));

  return createSupabaseBrowserClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: buildAuthCallbackUrl(getRuntimeAuthOrigin()),
      queryParams: {
        prompt: "select_account",
      },
    },
  });
}

export async function signOutFromSupabase() {
  return createSupabaseBrowserClient().auth.signOut();
}
