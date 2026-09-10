// Nén ảnh lá bài role ngay ở trình duyệt trước khi upload lên gallery GCS (roles/<game>/), theo
// đúng pattern optimizeShopItemImage (src/lib/shop-item-image.ts) — chuyển sang WebP, thu nhỏ giữ
// tỉ lệ gốc, PNG fallback (giữ trong suốt) nếu trình duyệt không encode được WebP.
export const GAME_ROLE_IMAGE_MAX_DIMENSION = 960;
export const GAME_ROLE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const GAME_ROLE_IMAGE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const GAME_ROLE_IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.88;
const FALLBACK_TYPE = "image/png";

type ClosableBitmap = ImageBitmap & { close?: () => void };

export async function optimizeGameRoleImage(file: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ClosableBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    if (!bitmap.width || !bitmap.height) {
      return file;
    }

    const scale = Math.min(1, GAME_ROLE_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const encoded =
      (await encodeCanvas(canvas, OUTPUT_TYPE, OUTPUT_QUALITY)) ?? (await encodeCanvas(canvas, FALLBACK_TYPE, 1));

    if (!encoded) {
      return file;
    }

    const extension = encoded.type === OUTPUT_TYPE ? "webp" : "png";

    return new File([encoded.blob], `game-role.${extension}`, { type: encoded.type });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

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
