export const DEFAULT_PLAYER_AVATAR_KEY = "avatar0";

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
  "khanh",
  "duong",
  "duy",
  "lan",
  "na",
  "oanh",
  "tri",
] as const;

export type PlayerAvatarKey = (typeof PLAYER_AVATAR_KEYS)[number];

const PLAYER_AVATAR_KEY_SET = new Set<string>(PLAYER_AVATAR_KEYS);

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
