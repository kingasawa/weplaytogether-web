export const DEFAULT_PLAYER_AVATAR_KEY = "avatar0";
export const PLAYER_AVATAR_OBJECT_PREFIX = "avatar/";

export const PLAYER_AVATAR_KEYS = [
  "avatar0",
  "img",
  "img_1",
  "img_2",
  "img_3",
  "img_4",
  "img_5",
  "img_6",
  "img_7",
  "img_8",
  "img_9",
  "img_10",
  "img_11",
  "img_12",
  "img_13",
  "img_14",
  "img_15",
  "img_16",
  "img_17",
  "img_18",
  "img_19",
] as const;

export type PlayerAvatarKey = (typeof PLAYER_AVATAR_KEYS)[number];

const PLAYER_AVATAR_KEY_SET = new Set<string>(PLAYER_AVATAR_KEYS);
const PLAYER_AVATAR_OBJECT_KEY_PATTERN =
  /^avatar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i;
const GOOGLE_AVATAR_HOST_PATTERN = /^lh[3-6]\.googleusercontent\.com$/i;

export function normalizePlayerAvatarKey(avatarKey?: string | null): PlayerAvatarKey {
  const normalizedAvatarKey = avatarKey?.trim();

  if (normalizedAvatarKey && PLAYER_AVATAR_KEY_SET.has(normalizedAvatarKey)) {
    return normalizedAvatarKey as PlayerAvatarKey;
  }

  return DEFAULT_PLAYER_AVATAR_KEY;
}

export function getPlayerAvatarPath(avatarKey?: string | null) {
  return `/images/avatars/${normalizePlayerAvatarKey(avatarKey)}.png`;
}

export function normalizeUploadedPlayerAvatarObjectKey(avatarObjectKey?: string | null) {
  const normalizedAvatarObjectKey = avatarObjectKey?.trim();

  if (
    normalizedAvatarObjectKey &&
    normalizedAvatarObjectKey.length <= 255 &&
    PLAYER_AVATAR_OBJECT_KEY_PATTERN.test(normalizedAvatarObjectKey)
  ) {
    return normalizedAvatarObjectKey;
  }

  return null;
}

export function isUploadedPlayerAvatarObjectKey(avatarObjectKey?: string | null): avatarObjectKey is string {
  return Boolean(normalizeUploadedPlayerAvatarObjectKey(avatarObjectKey));
}

export function normalizeGooglePlayerAvatarUrl(avatarUrl?: string | null) {
  const normalizedAvatarUrl = avatarUrl?.trim();

  if (!normalizedAvatarUrl || normalizedAvatarUrl.length > 2048) {
    return null;
  }

  try {
    const url = new URL(normalizedAvatarUrl);

    if (url.protocol !== "https:" || !GOOGLE_AVATAR_HOST_PATTERN.test(url.hostname)) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

export function isGooglePlayerAvatarUrl(avatarUrl?: string | null) {
  return Boolean(normalizeGooglePlayerAvatarUrl(avatarUrl));
}

export function normalizePlayerAvatarObjectKey(avatarObjectKey?: string | null) {
  return normalizeUploadedPlayerAvatarObjectKey(avatarObjectKey) ?? normalizeGooglePlayerAvatarUrl(avatarObjectKey);
}

export function normalizePlayerAvatarObjectKeyForSession(
  avatarObjectKey: string | null | undefined,
  sessionId: string
) {
  const normalizedAvatarObjectKey = normalizePlayerAvatarObjectKey(avatarObjectKey);

  if (!normalizedAvatarObjectKey) {
    return null;
  }

  if (isGooglePlayerAvatarUrl(normalizedAvatarObjectKey)) {
    return normalizedAvatarObjectKey;
  }

  const sessionPrefix = `${PLAYER_AVATAR_OBJECT_PREFIX}${sessionId}/`;

  return normalizedAvatarObjectKey.startsWith(sessionPrefix) ? normalizedAvatarObjectKey : null;
}

export function getUploadedPlayerAvatarUrl(avatarObjectKey?: string | null) {
  const normalizedAvatarObjectKey = normalizePlayerAvatarObjectKey(avatarObjectKey);

  if (!normalizedAvatarObjectKey) {
    return null;
  }

  const googleAvatarUrl = normalizeGooglePlayerAvatarUrl(normalizedAvatarObjectKey);

  if (googleAvatarUrl) {
    return googleAvatarUrl;
  }

  const publicBaseUrl = process.env.NEXT_PUBLIC_R2_AVATAR_PUBLIC_URL?.trim().replace(/\/+$/, "");

  if (!publicBaseUrl) {
    return null;
  }

  return `${publicBaseUrl}/${normalizedAvatarObjectKey
    .split("/")
    .map((pathPart) => encodeURIComponent(pathPart))
    .join("/")}`;
}

export function getPlayerAvatarSrc(avatarKey?: string | null, uploadedAvatarUrl?: string | null) {
  return uploadedAvatarUrl?.trim() || getPlayerAvatarPath(avatarKey);
}
