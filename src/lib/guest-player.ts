import { PLAYER_AVATAR_MAX_UPLOADS } from "@/lib/player-avatar-upload";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  normalizePlayerAvatarObjectKey,
  normalizePlayerAvatarKey,
  normalizeUploadedPlayerAvatarObjectKey,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";

export const GUEST_PLAYER_NAME_KEY = "boardverse:guest-name";
export const GUEST_PLAYER_AVATAR_KEY = "boardverse:guest-avatar";
export const GUEST_PLAYER_AVATAR_OBJECT_KEY = "boardverse:guest-avatar-object-key";
export const GUEST_PLAYER_AVATAR_UPLOADS_KEY = "boardverse:guest-avatar-uploads";
export const LEGACY_WOLF_GUEST_PLAYER_NAME_KEY = "boardverse:wolf-guest-name";
export const MAX_GUEST_PLAYER_NAME_LENGTH = 32;

export function readStoredGuestPlayerName() {
  if (typeof window === "undefined") {
    return "";
  }

  const savedGuestName =
    window.localStorage.getItem(GUEST_PLAYER_NAME_KEY)?.trim() ?? "";

  if (savedGuestName) {
    return savedGuestName;
  }

  const legacyGuestName =
    window.localStorage.getItem(LEGACY_WOLF_GUEST_PLAYER_NAME_KEY)?.trim() ?? "";

  if (legacyGuestName) {
    window.localStorage.setItem(GUEST_PLAYER_NAME_KEY, legacyGuestName);
  }

  return legacyGuestName;
}

export function saveStoredGuestPlayerName(guestName: string) {
  const normalizedGuestName = guestName
    .trim()
    .slice(0, MAX_GUEST_PLAYER_NAME_LENGTH);

  window.localStorage.setItem(GUEST_PLAYER_NAME_KEY, normalizedGuestName);
  window.localStorage.removeItem(LEGACY_WOLF_GUEST_PLAYER_NAME_KEY);

  return normalizedGuestName;
}

export function readStoredGuestPlayerAvatarKey(): PlayerAvatarKey {
  if (typeof window === "undefined") {
    return DEFAULT_PLAYER_AVATAR_KEY;
  }

  return normalizePlayerAvatarKey(window.localStorage.getItem(GUEST_PLAYER_AVATAR_KEY));
}

export function saveStoredGuestPlayerAvatarKey(avatarKey: string): PlayerAvatarKey {
  const normalizedAvatarKey = normalizePlayerAvatarKey(avatarKey);

  window.localStorage.setItem(GUEST_PLAYER_AVATAR_KEY, normalizedAvatarKey);

  return normalizedAvatarKey;
}

export function readStoredGuestPlayerAvatarObjectKey() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizePlayerAvatarObjectKey(window.localStorage.getItem(GUEST_PLAYER_AVATAR_OBJECT_KEY));
}

export function saveStoredGuestPlayerAvatarObjectKey(avatarObjectKey?: string | null) {
  const normalizedAvatarObjectKey = normalizePlayerAvatarObjectKey(avatarObjectKey);

  if (normalizedAvatarObjectKey) {
    window.localStorage.setItem(GUEST_PLAYER_AVATAR_OBJECT_KEY, normalizedAvatarObjectKey);
  } else {
    window.localStorage.removeItem(GUEST_PLAYER_AVATAR_OBJECT_KEY);
  }

  return normalizedAvatarObjectKey;
}

// Bộ sưu tập avatar mà guest đã upload (object key), mới nhất đứng đầu, tối đa PLAYER_AVATAR_MAX_UPLOADS.
export function readStoredGuestPlayerAvatarUploads(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  let parsed: unknown = null;

  try {
    parsed = JSON.parse(window.localStorage.getItem(GUEST_PLAYER_AVATAR_UPLOADS_KEY) ?? "[]");
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = parsed
    .map((objectKey) => normalizeUploadedPlayerAvatarObjectKey(typeof objectKey === "string" ? objectKey : null))
    .filter((objectKey): objectKey is string => Boolean(objectKey));

  return Array.from(new Set(normalized)).slice(0, PLAYER_AVATAR_MAX_UPLOADS);
}

function saveStoredGuestPlayerAvatarUploads(objectKeys: string[]): string[] {
  const normalized = Array.from(
    new Set(
      objectKeys
        .map((objectKey) => normalizeUploadedPlayerAvatarObjectKey(objectKey))
        .filter((objectKey): objectKey is string => Boolean(objectKey))
    )
  ).slice(0, PLAYER_AVATAR_MAX_UPLOADS);

  window.localStorage.setItem(GUEST_PLAYER_AVATAR_UPLOADS_KEY, JSON.stringify(normalized));

  return normalized;
}

export function addStoredGuestPlayerAvatarUpload(avatarObjectKey?: string | null): string[] {
  const normalizedAvatarObjectKey = normalizeUploadedPlayerAvatarObjectKey(avatarObjectKey);

  if (!normalizedAvatarObjectKey) {
    return readStoredGuestPlayerAvatarUploads();
  }

  const withoutDuplicate = readStoredGuestPlayerAvatarUploads().filter(
    (objectKey) => objectKey !== normalizedAvatarObjectKey
  );

  return saveStoredGuestPlayerAvatarUploads([normalizedAvatarObjectKey, ...withoutDuplicate]);
}

export function removeStoredGuestPlayerAvatarUpload(avatarObjectKey: string): string[] {
  return saveStoredGuestPlayerAvatarUploads(
    readStoredGuestPlayerAvatarUploads().filter((objectKey) => objectKey !== avatarObjectKey)
  );
}
