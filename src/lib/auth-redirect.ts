const DEFAULT_AUTH_NEXT_PATH = "/";
const DEFAULT_SITE_ORIGIN = "https://weplaytogether.online";
const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_NEXT_STORAGE_KEY = "boardverse.auth.nextPath";

export function normalizeAuthNextPath(nextPath?: string | string[] | null) {
  const rawNextPath = Array.isArray(nextPath) ? nextPath[0] : nextPath;
  const normalizedNextPath = rawNextPath?.trim();

  if (
    !normalizedNextPath ||
    !normalizedNextPath.startsWith("/") ||
    normalizedNextPath.startsWith("//") ||
    normalizedNextPath.includes("\\")
  ) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  return normalizedNextPath;
}

export function buildAuthPath(authPath: "/auth/sign-in" | "/auth/sign-up", nextPath?: string | string[] | null) {
  const normalizedNextPath = normalizeAuthNextPath(nextPath);

  if (normalizedNextPath === DEFAULT_AUTH_NEXT_PATH) {
    return authPath;
  }

  const searchParams = new URLSearchParams({ next: normalizedNextPath });

  return `${authPath}?${searchParams.toString()}`;
}

export function normalizeAuthOrigin(origin?: string | null) {
  const rawOrigin = origin?.trim() || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_ORIGIN;
  const originWithProtocol = /^https?:\/\//i.test(rawOrigin) ? rawOrigin : `https://${rawOrigin}`;

  try {
    const url = new URL(originWithProtocol);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_SITE_ORIGIN;
    }

    return url.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function getRuntimeAuthOrigin() {
  if (typeof window !== "undefined" && window.location.origin !== "null") {
    return normalizeAuthOrigin(window.location.origin);
  }

  return normalizeAuthOrigin();
}

export function buildAuthCallbackUrl(origin?: string | null) {
  const redirectUrl = new URL(AUTH_CALLBACK_PATH, normalizeAuthOrigin(origin));

  return redirectUrl.toString();
}
