export const GAME_BUG_REPORT_IMAGE_UPLOAD_FIELD_NAME = "image";
export const GAME_BUG_REPORT_IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
// Ảnh minh hoạ lỗi cần thấy rõ chi tiết giao diện hơn avatar nên cho phép nặng hơn đôi chút.
export const GAME_BUG_REPORT_IMAGE_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
export const GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const GAME_BUG_REPORT_IMAGE_MAX_COUNT = 3;
// Folder riêng trong cùng 1 bucket GCS (xem src/lib/avatar-storage.ts) — tách khỏi avatar/ và shop/.
export const GAME_BUG_REPORT_IMAGE_OBJECT_PREFIX = "bug-report/";

const GAME_BUG_REPORT_IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export function getGameBugReportImageExtension(contentType: string) {
  return GAME_BUG_REPORT_IMAGE_EXTENSIONS.get(contentType.toLowerCase()) ?? null;
}

// Object key theo <sessionId>/<gameId>/ để vừa giới hạn quyền xoá theo phiên người chơi, vừa
// cho phép report-actions.ts xác nhận ảnh gửi kèm report thực sự thuộc đúng ván đang report.
export function getGameBugReportImageObjectKeyPrefix(sessionId: string, gameId: string) {
  return `${GAME_BUG_REPORT_IMAGE_OBJECT_PREFIX}${sessionId}/${gameId}/`;
}

function getPublicBaseUrl() {
  return process.env.NEXT_PUBLIC_AVATAR_PUBLIC_URL?.trim().replace(/\/+$/, "") ?? null;
}

export function getGameBugReportImageUrl(objectKey: string) {
  const publicBaseUrl = getPublicBaseUrl();

  if (!publicBaseUrl) {
    return null;
  }

  return `${publicBaseUrl}/${objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function getGameBugReportImageObjectKeyFromUrl(imageUrl: string) {
  const publicBaseUrl = getPublicBaseUrl();

  if (!publicBaseUrl) {
    return null;
  }

  const prefix = `${publicBaseUrl}/`;

  if (!imageUrl.startsWith(prefix)) {
    return null;
  }

  try {
    return decodeURIComponent(imageUrl.slice(prefix.length));
  } catch {
    return null;
  }
}

export function isOwnedGameBugReportImageUrl(imageUrl: string, sessionId: string, gameId: string) {
  const objectKey = getGameBugReportImageObjectKeyFromUrl(imageUrl);
  return Boolean(objectKey?.startsWith(getGameBugReportImageObjectKeyPrefix(sessionId, gameId)));
}
