export const PLAYER_AVATAR_UPLOAD_FIELD_NAME = "avatar";
export const PREVIOUS_PLAYER_AVATAR_OBJECT_KEY_FIELD_NAME = "previousAvatarObjectKey";
export const PLAYER_AVATAR_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
// Hạn mức của file cuối cùng gửi lên server (sau khi client nén). Server cũng kiểm tra mức này.
export const PLAYER_AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
// Hạn mức của ảnh gốc user chọn (trước khi client nén). Cho phép ảnh từ điện thoại,
// client sẽ tự thu nhỏ về WebP nhỏ gọn trước khi upload.
export const PLAYER_AVATAR_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
// Số avatar upload tối đa mà mỗi user được giữ trong bộ sưu tập cá nhân.
export const PLAYER_AVATAR_MAX_UPLOADS = 3;

const PLAYER_AVATAR_UPLOAD_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export function getPlayerAvatarUploadExtension(contentType: string) {
  return PLAYER_AVATAR_UPLOAD_EXTENSIONS.get(contentType.toLowerCase()) ?? null;
}
