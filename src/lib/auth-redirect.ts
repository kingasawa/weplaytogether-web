const DEFAULT_AUTH_NEXT_PATH = "/";

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
