export const PLAYER_AVATAR_UPLOAD_FIELD_NAME = "avatar";
export const PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME = "previousAvatarObjectKey";
export const PLAYER_AVATAR_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
export const PLAYER_AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

const PLAYER_AVATAR_UPLOAD_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export function getPlayerAvatarUploadExtension(contentType: string) {
  return PLAYER_AVATAR_UPLOAD_EXTENSIONS.get(contentType.toLowerCase()) ?? null;
}
