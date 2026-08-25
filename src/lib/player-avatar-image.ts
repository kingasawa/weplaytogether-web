import { PLAYER_AVATAR_UPLOAD_MAX_BYTES } from "./player-avatar-upload";

// Avatar chỉ hiển thị ở kích thước nhỏ (<= ~56px), nên 256px là quá đủ kể cả màn retina.
export const PLAYER_AVATAR_TARGET_SIZE = 256;
export const PLAYER_AVATAR_OUTPUT_TYPE = "image/webp";
export const PLAYER_AVATAR_OUTPUT_QUALITY = 0.82;
// Fallback cho trình duyệt không encode được WebP (Safari cũ, vài WebView Android).
// Không có nhánh này thì toBlob trả null và ảnh gốc nguyên kích thước sẽ được upload.
const PLAYER_AVATAR_FALLBACK_TYPE = "image/jpeg";
const PLAYER_AVATAR_FALLBACK_QUALITY = 0.85;

type ClosableBitmap = ImageBitmap & { close?: () => void };

// Thu nhỏ + center-crop ảnh avatar về hình vuông WebP để giảm mạnh dung lượng
// trước khi upload. Chạy ở client (dùng canvas). Nếu môi trường/trình duyệt không
// hỗ trợ hoặc nén không nhỏ hơn ảnh gốc, trả về nguyên file gốc.
export async function optimizePlayerAvatarImage(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ClosableBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sourceSize = Math.min(bitmap.width, bitmap.height);

    if (!sourceSize) {
      return file;
    }

    // Không phóng to ảnh nhỏ hơn target — chỉ thu nhỏ khi cần.
    const targetSize = Math.min(PLAYER_AVATAR_TARGET_SIZE, sourceSize);
    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    const sourceX = (bitmap.width - sourceSize) / 2;
    const sourceY = (bitmap.height - sourceSize) / 2;
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, targetSize, targetSize);

    const encoded =
      (await encodeCanvas(canvas, PLAYER_AVATAR_OUTPUT_TYPE, PLAYER_AVATAR_OUTPUT_QUALITY)) ??
      (await encodeCanvas(canvas, PLAYER_AVATAR_FALLBACK_TYPE, PLAYER_AVATAR_FALLBACK_QUALITY));

    // Nếu nén không giúp nhỏ hơn, hoặc vẫn vượt hạn mức, giữ file gốc để server tự xử lý/ báo lỗi.
    if (!encoded || encoded.blob.size >= file.size || encoded.blob.size > PLAYER_AVATAR_UPLOAD_MAX_BYTES) {
      return file;
    }

    const extension = encoded.type === PLAYER_AVATAR_OUTPUT_TYPE ? "webp" : "jpg";

    return new File([encoded.blob], `avatar.${extension}`, { type: encoded.type });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

// Trả về null khi trình duyệt không encode được định dạng yêu cầu, để gọi tiếp fallback.
// Lưu ý: toBlob của một số trình duyệt âm thầm đổi sang PNG thay vì trả null, nên phải
// kiểm tra lại blob.type chứ không tin định dạng đã yêu cầu.
async function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<{ blob: Blob; type: string } | null> {
  const blob = await canvasToBlob(canvas, type, quality);

  if (!blob || blob.size <= 0 || blob.type !== type) {
    return null;
  }

  return { blob, type };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }

    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
