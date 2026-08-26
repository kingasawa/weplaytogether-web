import type { ShopItemType } from "@/lib/supabase/types";

// Kích thước tối đa (cạnh dài nhất) theo loại vật phẩm — khớp spec đã chốt khi thiết kế khung:
// avatar_frame vuông 512px, profile_frame 9-slice chiều ngang tối đa 960px.
export const SHOP_ITEM_IMAGE_MAX_DIMENSION: Record<ShopItemType, number> = {
  avatar_frame: 512,
  profile_frame: 960,
};

export const SHOP_ITEM_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
// Hạn mức ảnh gốc trước khi nén (cho phép ảnh xuất ra từ công cụ AI thường khá nặng).
export const SHOP_ITEM_IMAGE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
// Hạn mức file cuối cùng gửi lên server sau khi nén — server cũng tự kiểm tra lại mức này.
export const SHOP_ITEM_IMAGE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

const OUTPUT_TYPE = "image/webp";
const OUTPUT_QUALITY = 0.88;
// Fallback khi trình duyệt không encode được WebP: dùng PNG (giữ được trong suốt), KHÔNG
// dùng JPEG như khi nén avatar người chơi — khung avatar/khung thông tin bắt buộc phải có
// nền trong suốt để chồng lên nội dung bên dưới, JPEG sẽ biến nền trong suốt thành đen/trắng.
const FALLBACK_TYPE = "image/png";

type ClosableBitmap = ImageBitmap & { close?: () => void };

// Thu nhỏ (giữ nguyên tỉ lệ, không crop) + chuyển ảnh vật phẩm shop sang WebP ngay tại trình
// duyệt trước khi upload, bất kể định dạng gốc là gì (PNG/JPG/WebP...). Nếu môi trường không
// hỗ trợ canvas/createImageBitmap, trả về nguyên file gốc để server tự báo lỗi định dạng.
export async function optimizeShopItemImage(file: File, itemType: ShopItemType): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ClosableBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    if (!bitmap.width || !bitmap.height) {
      return file;
    }

    const maxDimension = SHOP_ITEM_IMAGE_MAX_DIMENSION[itemType];
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
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

    return new File([encoded.blob], `shop-item.${extension}`, { type: encoded.type });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

// Trả về null khi trình duyệt không encode được định dạng yêu cầu (một số trình duyệt âm
// thầm đổi sang PNG thay vì trả null nên phải kiểm tra lại blob.type).
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
