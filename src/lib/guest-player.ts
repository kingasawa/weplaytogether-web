export const GUEST_PLAYER_NAME_KEY = "boardverse:guest-name";
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
