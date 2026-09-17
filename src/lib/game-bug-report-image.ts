import { GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES } from "./game-bug-report-image-upload";

// Ảnh chụp màn hình lỗi cần đủ chi tiết để đọc chữ, nhưng vẫn giới hạn cạnh dài để không upload
// nguyên ảnh gốc chụp từ điện thoại (thường 3000-4000px).
const MAX_DIMENSION = 1600;
const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.85;
// Fallback khi trình duyệt không encode được WebP: JPEG (ảnh chụp màn hình không cần nền trong suốt).
const FALLBACK_TYPE = "image/jpeg";
const FALLBACK_QUALITY = 0.85;

type ClosableBitmap = ImageBitmap & { close?: () => void };

// Thu nhỏ (giữ nguyên tỉ lệ, không crop) + chuyển ảnh report sang WebP ngay tại trình duyệt
// trước khi upload, bất kể định dạng gốc. Nếu môi trường không hỗ trợ canvas/createImageBitmap,
// trả về nguyên file gốc để server tự báo lỗi định dạng/kích thước.
export async function optimizeGameBugReportImage(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ClosableBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    if (!bitmap.width || !bitmap.height) {
      return file;
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const encoded =
      (await encodeCanvas(canvas, OUTPUT_TYPE, OUTPUT_QUALITY)) ??
      (await encodeCanvas(canvas, FALLBACK_TYPE, FALLBACK_QUALITY));

    if (!encoded || encoded.blob.size > GAME_BUG_REPORT_IMAGE_UPLOAD_MAX_BYTES) {
      return file;
    }

    const extension = encoded.type === OUTPUT_TYPE ? "webp" : "jpg";

    return new File([encoded.blob], `bug-report.${extension}`, { type: encoded.type });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

// Trả về null khi trình duyệt không encode được định dạng yêu cầu (một số trình duyệt âm thầm
// đổi sang PNG thay vì trả null nên phải kiểm tra lại blob.type).
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
